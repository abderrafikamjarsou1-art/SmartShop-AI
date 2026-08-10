import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    business: { create: vi.fn(), update: vi.fn() },
    userBusiness: { create: vi.fn() },
    subscription: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: {
      userBusiness: { findFirst: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[])
      ),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { businessService } from "@/services/business-service";
import type { User } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocked = prisma as any;
const tx = mocked.__tx;

const user = { id: "user-1", email: "owner@example.com" } as User;

const input = { name: "Casa Phone Store", currency: "MAD", timezone: "Africa/Casablanca", taxRate: 20 };

const ctx = {
  businessId: "biz-1",
  role: "OWNER",
  user: { id: "user-1" },
  business: { id: "biz-1", name: "Casa Phone Store", currency: "MAD" },
} as unknown as TenantContext;

beforeEach(() => vi.clearAllMocks());

describe("businessService.create", () => {
  it("creates the business, an OWNER membership, and a FREE subscription — atomically (regression: first-login onboarding)", async () => {
    tx.business.create.mockResolvedValue({ id: "biz-1", name: "Casa Phone Store", taxRate: 20 });

    const result = await businessService.create(user, input);

    expect(result).toEqual({ id: "biz-1", name: "Casa Phone Store", taxRate: 20 });

    // All three writes happened inside the SAME $transaction call.
    expect(mocked.$transaction).toHaveBeenCalledTimes(1);

    expect(tx.business.create).toHaveBeenCalledWith({
      data: { name: "Casa Phone Store", currency: "MAD", timezone: "Africa/Casablanca", taxRate: 20, logoUrl: null },
    });
    expect(tx.userBusiness.create).toHaveBeenCalledWith({
      data: { userId: "user-1", businessId: "biz-1", role: "OWNER" },
    });
    expect(tx.subscription.create).toHaveBeenCalledWith({
      data: { businessId: "biz-1", plan: "FREE", status: "ACTIVE" },
    });
  });

  it("never trusts a userId from the input — only the authenticated user object is used", async () => {
    tx.business.create.mockResolvedValue({ id: "biz-1" });

    // Even if a caller's raw input object carried extra fields (a route
    // would strip these via zParse before this ever runs), the service
    // itself only ever reads user.id for the membership row.
    await businessService.create({ id: "real-user", email: "x@x.com" } as User, input);

    expect(tx.userBusiness.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "real-user" }) })
    );
  });

  it("defaults logoUrl to null when omitted", async () => {
    tx.business.create.mockResolvedValue({ id: "biz-1" });

    await businessService.create(user, { ...input, logoUrl: undefined });

    expect(tx.business.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ logoUrl: null }) })
    );
  });
});

describe("businessService.update", () => {
  it("updates the tenant's own business, scoped by ctx.businessId, and writes an audit entry", async () => {
    tx.business.update.mockResolvedValue({ id: "biz-1", name: "New Name", currency: "USD", timezone: "UTC", taxRate: 10 });

    const result = await businessService.update(ctx, { name: "New Name", currency: "USD", timezone: "UTC", taxRate: 10 });

    expect(result).toEqual({ id: "biz-1", name: "New Name", currency: "USD", timezone: "UTC", taxRate: 10 });
    expect(tx.business.update).toHaveBeenCalledWith({
      where: { id: "biz-1" },
      data: { name: "New Name", currency: "USD", timezone: "UTC", taxRate: 10 },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "business.update", businessId: "biz-1" }) })
    );
  });
});

describe("businessService.findFirstMembership", () => {
  it("scopes to the given userId and excludes deleted businesses", async () => {
    mocked.userBusiness.findFirst.mockResolvedValue(null);

    await businessService.findFirstMembership("user-1");

    expect(mocked.userBusiness.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", business: { deletedAt: null } },
        orderBy: { createdAt: "asc" },
      })
    );
  });
});
