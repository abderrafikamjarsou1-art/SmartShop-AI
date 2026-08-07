import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Route-layer tests for POST /api/webhooks/stripe. Previously had zero
 * real coverage — the only prior "test" (billing.test.ts) asserted a
 * direct DB insert throws on a duplicate key without ever invoking this
 * route. This exercises the actual handler: signature verification (bad
 * signature -> 400), idempotency (replay -> 200 duplicate, no double
 * processing), one real event-type branch end-to-end, and the
 * delete-the-idempotency-row-on-failure retry path.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: { create: vi.fn(), delete: vi.fn() },
    business: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/billing/stripe", () => ({ stripe: vi.fn() }));
vi.mock("@/services/billing-service", () => ({
  billingService: { syncFromStripe: vi.fn(), ownerEmails: vi.fn(), sendEmail: vi.fn() },
}));
vi.mock("@/lib/billing/plans", () => ({
  PLANS: { PRO: { name: "Pro" }, FREE: { name: "Free" } },
  planFromPriceId: vi.fn(),
}));

import { POST } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/billing/stripe";
import { billingService } from "@/services/billing-service";

const mockedPrisma = vi.mocked(prisma, true);
const mockedStripe = vi.mocked(stripe);
const mockedBilling = vi.mocked(billingService, true);

function webhookRequest(body: string, signature = "sig_test") {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body,
  });
}

function fakeStripeClient(constructEvent: (...args: unknown[]) => unknown) {
  return {
    webhooks: { constructEvent },
    subscriptions: { retrieve: vi.fn() },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/stripe — signature verification", () => {
  it("rejects a request with no stripe-signature header", async () => {
    const response = await POST(webhookRequest("{}", ""));
    expect(response.status).toBe(400);
    expect(mockedPrisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a request with an invalid signature — never reaches idempotency or handlers", async () => {
    mockedStripe.mockReturnValue(
      fakeStripeClient(() => {
        throw new Error("signature mismatch");
      })
    );

    const response = await POST(webhookRequest("{}"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid signature/i);
    expect(mockedPrisma.webhookEvent.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe — idempotency", () => {
  it("a replayed event id is a no-op: 200 duplicate, handler never runs", async () => {
    const event = { id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };
    mockedStripe.mockReturnValue(fakeStripeClient(() => event));

    const duplicateError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002", clientVersion: "6.2.1",
    });
    mockedPrisma.webhookEvent.create.mockRejectedValue(duplicateError);

    const response = await POST(webhookRequest(JSON.stringify(event)));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, duplicate: true });
    expect(mockedBilling.syncFromStripe).not.toHaveBeenCalled();
  });

  it("a genuine (non-P2002) idempotency-write failure surfaces as a 500, not a silent success", async () => {
    const event = { id: "evt_2", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };
    mockedStripe.mockReturnValue(fakeStripeClient(() => event));
    mockedPrisma.webhookEvent.create.mockRejectedValue(new Error("connection lost"));

    await expect(POST(webhookRequest(JSON.stringify(event)))).rejects.toThrow("connection lost");
  });
});

describe("POST /api/webhooks/stripe — event routing", () => {
  it("customer.subscription.updated syncs the subscription and acknowledges", async () => {
    const sub = { id: "sub_1", metadata: {} };
    const event = { id: "evt_3", type: "customer.subscription.updated", data: { object: sub } };
    mockedStripe.mockReturnValue(fakeStripeClient(() => event));
    mockedPrisma.webhookEvent.create.mockResolvedValue({} as never);

    const response = await POST(webhookRequest(JSON.stringify(event)));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mockedBilling.syncFromStripe).toHaveBeenCalledWith(sub);
  });

  it("an unrecognized event type is acknowledged without calling any handler", async () => {
    const event = { id: "evt_4", type: "some.unhandled.event", data: { object: {} } };
    mockedStripe.mockReturnValue(fakeStripeClient(() => event));
    mockedPrisma.webhookEvent.create.mockResolvedValue({} as never);

    const response = await POST(webhookRequest(JSON.stringify(event)));

    expect(response.status).toBe(200);
    expect(mockedBilling.syncFromStripe).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe — handler failure retry path", () => {
  it("on handler failure, deletes the idempotency row so Stripe's retry can reprocess, and returns 500", async () => {
    const sub = { id: "sub_1", metadata: {} };
    const event = { id: "evt_5", type: "customer.subscription.updated", data: { object: sub } };
    mockedStripe.mockReturnValue(fakeStripeClient(() => event));
    mockedPrisma.webhookEvent.create.mockResolvedValue({} as never);
    mockedPrisma.webhookEvent.delete.mockResolvedValue({} as never);
    mockedBilling.syncFromStripe.mockRejectedValue(new Error("downstream sync failed"));

    const response = await POST(webhookRequest(JSON.stringify(event)));

    expect(response.status).toBe(500);
    expect(mockedPrisma.webhookEvent.delete).toHaveBeenCalledWith({ where: { stripeEventId: "evt_5" } });
  });
});
