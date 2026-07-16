import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Contacts tests — the crown jewel is the FIFO payment allocation:
 * money must land on the oldest open sales, statuses must update by
 * the same rule the POS uses, and totals must reconcile exactly.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    customer: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
    supplier: { create: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    sale: { findMany: vi.fn(), update: vi.fn() },
    salePayment: { create: vi.fn() },
    customerPayment: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: {
      customer: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      supplier: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      purchase: { count: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
      customerPayment: { findMany: vi.fn() },
      salePayment: { findMany: vi.fn() },
      sale: { findMany: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[])
      ),
      $queryRaw: vi.fn().mockResolvedValue([{}]),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { customerService } from "@/services/customer-service";
import { supplierService } from "@/services/supplier-service";
import { ValidationError, ConflictError } from "@/lib/errors";
import { createCustomerSchema, recordPaymentSchema } from "@/lib/validation/contact";
import type { TenantContext } from "@/lib/tenant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocked = prisma as any;
const tx = mocked.__tx;

const ctx = {
  businessId: "biz-1", role: "OWNER", user: { id: "user-1" },
  business: { id: "biz-1", currency: "MAD" },
} as unknown as TenantContext;

const CID = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  tx.customerPayment.create.mockImplementation(async (args: { data: unknown }) => ({ id: "pay1", ...(args.data as object) }));
});

describe("customerService.recordPayment — FIFO allocation", () => {
  const openSales = [
    { id: "s1", saleNumber: 10, total: 100, amountPaid: 40 },  // 60 open (oldest)
    { id: "s2", saleNumber: 11, total: 200, amountPaid: 0 },   // 200 open
    { id: "s3", saleNumber: 12, total: 50, amountPaid: 0 },    // 50 open
  ];

  beforeEach(() => {
    mocked.customer.findFirst.mockResolvedValue({ id: CID, outstandingBalance: 310, storeCredit: 0 });
    tx.sale.findMany.mockResolvedValue(openSales);
  });

  it("fills the oldest sale first, then flows into the next", async () => {
    const { allocations } = await customerService.recordPayment(ctx, {
      customerId: CID, method: "CASH", amount: 150,
    });

    // 150 -> 60 to sale 10 (fully paid), 90 to sale 11 (partial), nothing to 12
    expect(allocations).toEqual([
      { saleId: "s1", saleNumber: 10, amount: 60 },
      { saleId: "s2", saleNumber: 11, amount: 90 },
    ]);

    // Sale statuses updated by the SAME rule the POS uses
    expect(tx.sale.update).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ data: expect.objectContaining({ amountPaid: 100, paymentStatus: "PAID" }) }));
    expect(tx.sale.update).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ data: expect.objectContaining({ amountPaid: 90, paymentStatus: "PARTIAL" }) }));

    // Money lands in SalePayment (cash drawer truth) — one row per allocation
    expect(tx.salePayment.create).toHaveBeenCalledTimes(2);

    // Balance decremented by exactly the payment amount
    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { outstandingBalance: { decrement: 150 } } }));
  });

  it("allocations reconcile exactly with the payment amount", async () => {
    const { allocations } = await customerService.recordPayment(ctx, {
      customerId: CID, method: "CARD", amount: 310,
    });
    expect(allocations.reduce((s, a) => s + a.amount, 0)).toBe(310);
    expect(allocations.map((a) => a.saleNumber)).toEqual([10, 11, 12]); // strict FIFO
  });

  it("rejects paying more than the outstanding balance", async () => {
    await expect(
      customerService.recordPayment(ctx, { customerId: CID, method: "CASH", amount: 500 })
    ).rejects.toThrow(/exceeds/i);
  });

  it("rejects when nothing is owed", async () => {
    mocked.customer.findFirst.mockResolvedValue({ id: CID, outstandingBalance: 0, storeCredit: 0 });
    await expect(
      customerService.recordPayment(ctx, { customerId: CID, method: "CASH", amount: 10 })
    ).rejects.toThrow(ValidationError);
  });

  it("store-credit payments use an atomic credit guard", async () => {
    mocked.customer.findFirst.mockResolvedValue({ id: CID, outstandingBalance: 100, storeCredit: 5 });
    tx.customer.updateMany.mockResolvedValue({ count: 0 }); // guard fails
    await expect(
      customerService.recordPayment(ctx, { customerId: CID, method: "STORE_CREDIT", amount: 50 })
    ).rejects.toThrow(ConflictError);
  });
});

describe("customerService guards", () => {
  it("blocks deleting a customer who still owes money", async () => {
    mocked.customer.findFirst.mockResolvedValue({ id: CID, outstandingBalance: 120 });
    await expect(customerService.softDelete(ctx, CID)).rejects.toThrow(/owes money/);
  });
});

describe("import duplicate detection", () => {
  const csv = "name,phone,email\nAli,0600000001,ali@x.com\nSara,0600000002,sara@x.com\nBad,,not-an-email";

  it("flags rows matching existing phone/email and invalid rows", async () => {
    mocked.customer.findMany.mockResolvedValue([{ phone: "0600000001", email: null }]);
    const preview = await customerService.previewImport(ctx, csv);
    expect(preview).toEqual([
      expect.objectContaining({ row: 1, status: "duplicate" }),
      expect.objectContaining({ row: 2, status: "ok" }),
      expect.objectContaining({ row: 3, status: "error" }),
    ]);
  });

  it("commit imports only the ok rows", async () => {
    mocked.customer.findMany.mockResolvedValue([{ phone: "0600000001", email: null }]);
    const result = await customerService.commitImport(ctx, csv);
    expect(result).toEqual({ imported: 1, skipped: 2 });
    expect(tx.customer.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ name: "Sara" })] })
    );
  });
});

describe("supplierService guards", () => {
  it("blocks deleting a supplier with open purchase orders", async () => {
    mocked.supplier.findFirst.mockResolvedValue({ id: "sup1" });
    mocked.purchase.count.mockResolvedValue(2);
    await expect(supplierService.softDelete(ctx, "sup1")).rejects.toThrow(/open purchase orders/);
  });
});

describe("contact validation", () => {
  it("accepts a minimal customer and normalizes empty email", () => {
    const r = createCustomerSchema.safeParse({ name: "Ali", email: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBeUndefined();
  });
  it("rejects an invalid email", () => {
    expect(createCustomerSchema.safeParse({ name: "Ali", email: "nope" }).success).toBe(false);
  });
  it("caps tags at 10", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(createCustomerSchema.safeParse({ name: "Ali", tags }).success).toBe(false);
  });
  it("payment amount must be positive", () => {
    expect(recordPaymentSchema.safeParse({
      customerId: CID, method: "CASH", amount: 0,
    }).success).toBe(false);
  });
});
