import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Sale service tests — Prisma mocked. What we verify is OUR logic:
 * idempotency, the atomic stock guard, snapshotting, payment status,
 * returns math and INVENTORY CONSISTENCY (movements always mirror
 * stock changes 1:1).
 */

vi.mock("server-only", () => ({}));
vi.mock("@/services/stock-alerts", () => ({ syncLowStockAlert: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    product: { updateMany: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    sale: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
    saleItem: { update: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    salePayment: { create: vi.fn() },
    customer: { update: vi.fn(), updateMany: vi.fn() },
    invoice: { findFirst: vi.fn(), create: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: {
      sale: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
      product: { findMany: vi.fn(), findFirst: vi.fn() },
      customer: { findMany: vi.fn() },
      $transaction: vi.fn(async (arg: unknown, _opts?: unknown) =>
        typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[])
      ),
      $queryRaw: vi.fn().mockResolvedValue([]),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { saleService } from "@/services/sale-service";
import { ConflictError, ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocked = prisma as any;
const tx = mocked.__tx;

const ctx = {
  businessId: "biz-1",
  role: "OWNER",
  user: { id: "user-1" },
  business: { id: "biz-1", currency: "MAD", taxRate: 20, allowOverselling: false },
} as unknown as TenantContext;

const productA = { id: "pa", name: "Cable", sku: "C1", sellingPrice: 100, buyingPrice: 60, quantity: 10 };

const baseInput = {
  clientRef: "11111111-1111-1111-1111-111111111111",
  status: "COMPLETED" as const,
  items: [{ productId: "pa", quantity: 2, discountAmount: 0 }],
  globalDiscount: 0,
  payments: [{ method: "CASH" as const, amount: 240 }],
};

function armHappyPath() {
  mocked.sale.findFirst.mockResolvedValue(null); // no idempotent hit
  mocked.product.findMany.mockResolvedValue([productA]);
  tx.product.updateMany.mockResolvedValue({ count: 1 }); // stock guard passes
  tx.sale.findFirst.mockResolvedValue({ saleNumber: 41 });
  tx.sale.create.mockImplementation(async (args: { data: unknown }) => ({
    id: "s1", saleNumber: 42, ...(args.data as object), invoice: null, items: [], payments: [],
  }));
  tx.invoice.findFirst.mockResolvedValue({ invoiceNumber: 7 });
  tx.sale.findUniqueOrThrow.mockResolvedValue({ id: "s1", saleNumber: 42 });
}

beforeEach(() => { vi.clearAllMocks(); armHappyPath(); });

describe("saleService.create — completed sale", () => {
  it("is idempotent on clientRef (retry never double-writes)", async () => {
    mocked.sale.findFirst.mockResolvedValue({ id: "existing", saleNumber: 42 });
    const result = await saleService.create(ctx, baseInput);
    expect(result.id).toBe("existing");
    expect(mocked.$transaction).not.toHaveBeenCalled(); // zero writes
  });

  it("snapshots unitPrice and unitCost from the product at sale time", async () => {
    await saleService.create(ctx, baseInput);
    const created = tx.sale.create.mock.calls[0][0].data;
    expect(created.items.create[0]).toMatchObject({ unitPrice: 100, unitCost: 60 });
  });

  it("uses the atomic stock guard and fails with ConflictError when short", async () => {
    tx.product.updateMany.mockResolvedValue({ count: 0 }); // conditional decrement matched nothing
    await expect(saleService.create(ctx, baseInput)).rejects.toThrow(ConflictError);
    // and the guard was conditional on quantity >= needed
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ quantity: { gte: 2 } }) })
    );
  });

  it("skips the quantity condition when overselling is allowed", async () => {
    const osCtx = { ...ctx, business: { ...ctx.business, allowOverselling: true } } as TenantContext;
    await saleService.create(osCtx, baseInput);
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ quantity: expect.anything() }) })
    );
  });

  it("INVENTORY CONSISTENCY: one SALE movement per line, mirroring the decrement", async () => {
    await saleService.create(ctx, baseInput);
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "SALE", quantity: -2, quantityBefore: 10, quantityAfter: 8 }),
      })
    );
  });

  it("ignores price override for roles without sales:manage", async () => {
    const cashierCtx = { ...ctx, role: "CASHIER" } as TenantContext;
    await saleService.create(cashierCtx, {
      ...baseInput,
      items: [{ productId: "pa", quantity: 2, discountAmount: 0, unitPriceOverride: 1 }],
      payments: [{ method: "CASH", amount: 240 }],
    });
    const created = tx.sale.create.mock.calls[0][0].data;
    expect(created.items.create[0].unitPrice).toBe(100); // DB price won
  });

  it("walk-in sales must be paid in full", async () => {
    await expect(
      saleService.create(ctx, { ...baseInput, payments: [{ method: "CASH", amount: 100 }] })
    ).rejects.toThrow(ValidationError);
  });

  it("unpaid remainder goes to the customer's outstanding balance", async () => {
    await saleService.create(ctx, {
      ...baseInput, customerId: "22222222-2222-2222-2222-222222222222",
      payments: [{ method: "CASH", amount: 140 }], // total 240 -> 100 open
    });
    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { outstandingBalance: { increment: 100 } } })
    );
  });

  it("store credit uses an atomic balance guard", async () => {
    tx.customer.updateMany.mockResolvedValue({ count: 0 }); // not enough credit
    await expect(
      saleService.create(ctx, {
        ...baseInput, customerId: "22222222-2222-2222-2222-222222222222",
        payments: [{ method: "STORE_CREDIT", amount: 240 }],
      })
    ).rejects.toThrow(/store credit/i);
  });

  it("creates a sequential invoice inside the same transaction", async () => {
    await saleService.create(ctx, baseInput);
    expect(tx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ invoiceNumber: 8 }) })
    );
  });

  it("drafts touch no stock, no payments, no invoice", async () => {
    await saleService.create(ctx, { ...baseInput, status: "DRAFT", payments: [] });
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });
});

describe("saleService.processReturn", () => {
  const soldSale = {
    id: "s1", saleNumber: 42, status: "COMPLETED", customerId: "c1",
    subtotal: 300, total: 297, amountPaid: 297,
    items: [
      { id: "i1", productId: "pa", quantity: 2, returnedQuantity: 0, total: 200, product: { name: "Cable" } },
      { id: "i2", productId: "pb", quantity: 1, returnedQuantity: 0, total: 100, product: { name: "Mouse" } },
    ],
    payments: [{ method: "CASH", amount: 297 }],
  };

  beforeEach(() => {
    mocked.sale.findFirst.mockResolvedValue(soldSale);
    tx.product.update.mockImplementation(async (args: { data: { quantity: { increment: number } } }) => ({
      id: "pa", name: "Cable", quantity: 8 + args.data.quantity.increment, minimumStock: 2,
    }));
    tx.saleItem.findMany.mockResolvedValue([
      { quantity: 2, returnedQuantity: 1 }, { quantity: 1, returnedQuantity: 0 },
    ]);
    tx.sale.update.mockResolvedValue({ ...soldSale, status: "PARTIALLY_RETURNED" });
  });

  it("rejects returning more than returnable", async () => {
    await expect(
      saleService.processReturn(ctx, {
        saleId: "s1", items: [{ saleItemId: "i1", quantity: 5 }], reason: "x", refundMethod: "CASH",
      })
    ).rejects.toThrow(/can be returned/);
  });

  it("restores stock with a RETURN movement and refunds at the effective rate", async () => {
    await saleService.processReturn(ctx, {
      saleId: "s1", items: [{ saleItemId: "i1", quantity: 1 }], reason: "Defective", refundMethod: "CASH",
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "RETURN", quantity: 1 }) })
    );
    // refund = 100 * (297/300) = 99, recorded as a NEGATIVE payment
    expect(tx.salePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: -99 }) })
    );
  });

  it("store-credit refunds increment the customer's credit", async () => {
    await saleService.processReturn(ctx, {
      saleId: "s1", items: [{ saleItemId: "i2", quantity: 1 }], reason: "x", refundMethod: "STORE_CREDIT",
    });
    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { storeCredit: { increment: 99 } } })
    );
  });

  it("full return marks the sale RETURNED + REFUNDED", async () => {
    tx.saleItem.findMany.mockResolvedValue([
      { quantity: 2, returnedQuantity: 2 }, { quantity: 1, returnedQuantity: 1 },
    ]);
    await saleService.processReturn(ctx, {
      saleId: "s1",
      items: [{ saleItemId: "i1", quantity: 2 }, { saleItemId: "i2", quantity: 1 }],
      reason: "x", refundMethod: "CASH",
    });
    expect(tx.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RETURNED", paymentStatus: "REFUNDED" }) })
    );
  });

  it("never refunds more than was paid", async () => {
    mocked.sale.findFirst.mockResolvedValue({ ...soldSale, amountPaid: 50 }); // only 50 was ever paid
    await saleService.processReturn(ctx, {
      saleId: "s1", items: [{ saleItemId: "i1", quantity: 2 }], reason: "x", refundMethod: "CASH",
    });
    const refund = tx.salePayment.create.mock.calls[0][0].data.amount;
    expect(-refund).toBeLessThanOrEqual(50);
  });
});

describe("saleService.voidSale", () => {
  it("restores remaining units and reverses payments", async () => {
    mocked.sale.findFirst.mockResolvedValue({
      id: "s1", saleNumber: 42, status: "COMPLETED", customerId: null,
      total: 240, amountPaid: 240,
      items: [{ id: "i1", productId: "pa", quantity: 2, returnedQuantity: 1, product: { name: "Cable" } }],
      payments: [{ method: "CASH", amount: 240 }],
    });
    tx.product.update.mockResolvedValue({ id: "pa", name: "Cable", quantity: 9, minimumStock: 2 });
    tx.sale.update.mockResolvedValue({ id: "s1", status: "VOIDED" });

    await saleService.voidSale(ctx, "s1", "Cashier error");

    // Only the 1 not-yet-returned unit goes back
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { increment: 1 } } })
    );
    // Payment mirrored negatively
    expect(tx.salePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: -240 }) })
    );
  });
});
