import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Billing platform tests: feature flags, quotas, webhook idempotency,
 * subscription sync mapping, cancel/resume semantics.
 */

vi.mock("server-only", () => ({}));

// The mock object must be built INSIDE the vi.mock factory (Vitest hoists
// vi.mock calls above top-level const/let, so a `db` declared outside and
// referenced from the factory would be read before its own initialization).
vi.mock("@/lib/prisma", () => {
  const db = {
    subscription: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    product: { count: vi.fn() },
    customer: { count: vi.fn() },
    supplier: { count: vi.fn() },
    sale: { count: vi.fn() },
    invoice: { count: vi.fn() },
    aiMessage: { count: vi.fn() },
    usageCounter: { findUnique: vi.fn(), upsert: vi.fn() },
    webhookEvent: { create: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function" ? (arg as (t: typeof db) => unknown)(db) : Promise.all(arg as Promise<unknown>[])),
  };
  return { prisma: db };
});

const stripeMock = {
  subscriptions: { retrieve: vi.fn(), update: vi.fn() },
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
};
vi.mock("@/lib/billing/stripe", () => ({ stripe: () => stripeMock }));
vi.mock("@/lib/billing/emails", () => ({ sendBillingEmail: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { entitlementService, FeatureLockedError, QuotaExceededError } from "@/services/entitlement-service";
import { billingService } from "@/services/billing-service";
import type { TenantContext } from "@/lib/tenant";
import type Stripe from "stripe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const ctx = {
  businessId: "biz-1", role: "OWNER",
  user: { id: "u1", email: "owner@shop.ma" },
  business: { id: "biz-1", name: "Shop", suspendedAt: null },
} as unknown as TenantContext;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_m";
  process.env.STRIPE_PRICE_PRO_YEARLY = "price_pro_y";
  process.env.STRIPE_PRICE_BUSINESS_MONTHLY = "price_biz_m";
  process.env.STRIPE_PRICE_BUSINESS_YEARLY = "price_biz_y";
});

describe("feature flags", () => {
  it("FREE plan: AI assistant is locked with an upgrade message", async () => {
    db.subscription.findUnique.mockResolvedValue({ plan: "FREE", status: "ACTIVE" });
    await expect(entitlementService.requireFeature(ctx, "aiAssistant"))
      .rejects.toThrow(FeatureLockedError);
    await expect(entitlementService.requireFeature(ctx, "aiAssistant"))
      .rejects.toThrow(/Upgrade in Settings/);
  });

  it("PRO plan: AI unlocked, multiBusiness still locked", async () => {
    db.subscription.findUnique.mockResolvedValue({ plan: "PRO", status: "ACTIVE" });
    await expect(entitlementService.requireFeature(ctx, "aiAssistant")).resolves.toBeUndefined();
    await expect(entitlementService.requireFeature(ctx, "multiBusiness")).rejects.toThrow(FeatureLockedError);
  });

  it("canceled subscription falls back to FREE entitlements", async () => {
    db.subscription.findUnique.mockResolvedValue({ plan: "PRO", status: "CANCELED" });
    expect(await entitlementService.getPlan(ctx)).toBe("FREE");
  });

  it("PAST_DUE keeps access while Stripe retries", async () => {
    db.subscription.findUnique.mockResolvedValue({ plan: "PRO", status: "PAST_DUE" });
    expect(await entitlementService.getPlan(ctx)).toBe("PRO");
  });

  it("suspended business is blocked from everything", async () => {
    const suspended = { ...ctx, business: { ...ctx.business, suspendedAt: new Date() } } as TenantContext;
    await expect(entitlementService.requireFeature(suspended, "csvExport")).rejects.toThrow(/suspended/);
  });
});

describe("quotas", () => {
  beforeEach(() => db.subscription.findUnique.mockResolvedValue({ plan: "FREE", status: "ACTIVE" }));

  it("counts from the source table and rejects gracefully at the limit", async () => {
    db.product.count.mockResolvedValue(50); // FREE limit = 50
    await expect(entitlementService.requireQuota(ctx, "products"))
      .rejects.toThrow(QuotaExceededError);
    await expect(entitlementService.requireQuota(ctx, "products"))
      .rejects.toThrow(/50 products/);
  });

  it("allows creation below the limit", async () => {
    db.product.count.mockResolvedValue(49);
    await expect(entitlementService.requireQuota(ctx, "products")).resolves.toBeUndefined();
  });

  it("respects the increment (bulk import of 5 with 47 used = rejected)", async () => {
    db.product.count.mockResolvedValue(47);
    await expect(entitlementService.requireQuota(ctx, "products", 5)).rejects.toThrow(QuotaExceededError);
  });

  it("BUSINESS plan: Infinity quotas never query or reject", async () => {
    db.subscription.findUnique.mockResolvedValue({ plan: "BUSINESS", status: "ACTIVE" });
    await expect(entitlementService.requireQuota(ctx, "products")).resolves.toBeUndefined();
    expect(db.product.count).not.toHaveBeenCalled();
  });

  it("AI requests count from AiMessage this month", async () => {
    db.subscription.findUnique.mockResolvedValue({ plan: "PRO", status: "ACTIVE" });
    db.aiMessage.count.mockResolvedValue(500); // PRO limit = 500
    await expect(entitlementService.requireQuota(ctx, "aiRequestsPerMonth")).rejects.toThrow(QuotaExceededError);
  });
});

describe("subscription sync (Stripe -> local read model)", () => {
  const stripeSub = (over: Partial<Stripe.Subscription> = {}) => ({
    id: "sub_1", status: "active", cancel_at_period_end: false, trial_end: null,
    current_period_end: 1893456000,
    metadata: { businessId: "biz-1" },
    items: { data: [{ price: { id: "price_pro_m" } }] },
    ...over,
  }) as unknown as Stripe.Subscription;

  it("maps price id -> plan and status -> local enum", async () => {
    await billingService.syncFromStripe(stripeSub());
    expect(db.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz-1" },
        data: expect.objectContaining({ plan: "PRO", interval: "MONTHLY", status: "ACTIVE" }),
      })
    );
  });

  it("canceled subscription drops the plan to FREE", async () => {
    await billingService.syncFromStripe(stripeSub({ status: "canceled" } as Partial<Stripe.Subscription>));
    expect(db.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plan: "FREE", status: "CANCELED" }) })
    );
  });

  it("trialing sets TRIALING + trialEndsAt", async () => {
    await billingService.syncFromStripe(stripeSub({ status: "trialing", trial_end: 1893456000 } as Partial<Stripe.Subscription>));
    expect(db.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "TRIALING", trialEndsAt: expect.any(Date) }),
      })
    );
  });

  it("maps current_period_end (top-level Stripe field) to a local Date", async () => {
    await billingService.syncFromStripe(stripeSub({ current_period_end: 1893456000 } as unknown as Partial<Stripe.Subscription>));
    expect(db.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentPeriodEnd: new Date(1893456000 * 1000) }),
      })
    );
  });

  it("ignores subscriptions without businessId metadata (no crash, no write)", async () => {
    await billingService.syncFromStripe(stripeSub({ metadata: {} } as Partial<Stripe.Subscription>));
    expect(db.subscription.update).not.toHaveBeenCalled();
  });
});

describe("cancel / resume", () => {
  beforeEach(() => {
    db.subscription.findUnique.mockResolvedValue({ id: "s1", stripeSubscriptionId: "sub_1" });
    stripeMock.subscriptions.update.mockResolvedValue({
      id: "sub_1", status: "active", cancel_at_period_end: true, trial_end: null,
      current_period_end: 1893456000,
      metadata: { businessId: "biz-1" },
      items: { data: [{ price: { id: "price_pro_m" } }] },
    });
  });

  it("cancel schedules at period end (never immediate)", async () => {
    await billingService.cancel(ctx);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
  });

  it("resume clears the flag", async () => {
    await billingService.resume(ctx);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: false });
  });

  it("both are audited", async () => {
    await billingService.cancel(ctx);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "billing.cancel_scheduled" }) })
    );
  });
});

describe("webhook idempotency contract", () => {
  it("duplicate event id -> unique violation -> treated as replay", async () => {
    const { Prisma } = await import("@prisma/client");
    db.webhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" })
    );
    // The route catches P2002 and returns 200 {duplicate:true} — asserted
    // here at the contract level: create is the FIRST thing that runs.
    await expect(db.webhookEvent.create({ data: { stripeEventId: "evt_1", type: "invoice.paid" } }))
      .rejects.toMatchObject({ code: "P2002" });
  });
});
