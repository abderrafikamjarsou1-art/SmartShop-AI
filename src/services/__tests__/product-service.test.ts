import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Service unit tests — Prisma is mocked, so these test OUR logic:
 * tenant scoping, business rules, transactions and side effects
 * (movements + audit), not the database itself.
 */

// ---- Mock prisma (hoisted before the service import) ----
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    product: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    productImage: { deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    notification: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
  };
  return {
    prisma: {
      product: {
        findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(),
      },
      category: { findMany: vi.fn(), findFirst: vi.fn() },
      supplier: { findMany: vi.fn(), findFirst: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[])
      ),
      $queryRaw: vi.fn().mockResolvedValue([]),
      __tx: tx, // exposed for assertions
    },
  };
});

import { prisma } from "@/lib/prisma";
import { productService } from "@/services/product-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocked = prisma as any;
const tx = mocked.__tx;

const ctx = {
  businessId: "biz-1",
  role: "OWNER",
  user: { id: "user-1" },
  business: { id: "biz-1", currency: "MAD" },
} as unknown as TenantContext;

beforeEach(() => vi.clearAllMocks());

describe("productService.create", () => {
  it("creates product, INITIAL movement and audit log atomically", async () => {
    tx.product.create.mockResolvedValue({ id: "p1", name: "Cable", sku: "C1" });

    await productService.create(ctx, {
      name: "Cable", buyingPrice: 10, sellingPrice: 25, quantity: 5,
      minimumStock: 2, status: "ACTIVE", allowLoss: false, images: [],
    });

    // Tenant scope on the insert
    expect(tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessId: "biz-1" }) })
    );
    // Opening stock -> ledger entry with before/after snapshots
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "INITIAL", quantity: 5, quantityBefore: 0, quantityAfter: 5 }),
      })
    );
    // Audit trail in the same transaction
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "product.create" }) })
    );
  });

  it("does NOT create a movement when opening stock is 0", async () => {
    tx.product.create.mockResolvedValue({ id: "p1", name: "Cable" });

    await productService.create(ctx, {
      name: "Cable", buyingPrice: 10, sellingPrice: 25, quantity: 0,
      minimumStock: 0, status: "ACTIVE", allowLoss: false, images: [],
    });

    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("SECURITY: rejects a categoryId that does not belong to the tenant, before any write", async () => {
    mocked.category.findFirst.mockResolvedValue(null); // belongs to another business, or doesn't exist
    await expect(
      productService.create(ctx, {
        name: "Cable", categoryId: "cat-other-tenant", buyingPrice: 10, sellingPrice: 25, quantity: 0,
        minimumStock: 0, status: "ACTIVE", allowLoss: false, images: [],
      })
    ).rejects.toThrow(NotFoundError);
    expect(tx.product.create).not.toHaveBeenCalled();
  });

  it("SECURITY: rejects a supplierId that does not belong to the tenant, before any write", async () => {
    mocked.supplier.findFirst.mockResolvedValue(null);
    await expect(
      productService.create(ctx, {
        name: "Cable", supplierId: "sup-other-tenant", buyingPrice: 10, sellingPrice: 25, quantity: 0,
        minimumStock: 0, status: "ACTIVE", allowLoss: false, images: [],
      })
    ).rejects.toThrow(NotFoundError);
    expect(tx.product.create).not.toHaveBeenCalled();
  });

  it("accepts a categoryId/supplierId that belong to the tenant", async () => {
    mocked.category.findFirst.mockResolvedValue({ id: "cat-1" });
    mocked.supplier.findFirst.mockResolvedValue({ id: "sup-1" });
    tx.product.create.mockResolvedValue({ id: "p1", name: "Cable" });

    await productService.create(ctx, {
      name: "Cable", categoryId: "cat-1", supplierId: "sup-1", buyingPrice: 10, sellingPrice: 25, quantity: 0,
      minimumStock: 0, status: "ACTIVE", allowLoss: false, images: [],
    });

    expect(mocked.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "cat-1", businessId: "biz-1" }) })
    );
    expect(tx.product.create).toHaveBeenCalled();
  });
});

describe("productService.update", () => {
  it("SECURITY: rejects a categoryId that does not belong to the tenant, before any write", async () => {
    mocked.product.findFirst.mockResolvedValue({ id: "p1", name: "Cable", sellingPrice: 25, images: [] });
    mocked.category.findFirst.mockResolvedValue(null);

    await expect(
      productService.update(ctx, {
        id: "p1", name: "Cable", categoryId: "cat-other-tenant", buyingPrice: 10, sellingPrice: 25,
        quantity: 0, minimumStock: 0, status: "ACTIVE", allowLoss: false, images: [],
      })
    ).rejects.toThrow(NotFoundError);
    expect(tx.product.update).not.toHaveBeenCalled();
  });
});

describe("productService.getById", () => {
  it("scopes the lookup to the tenant", async () => {
    mocked.product.findFirst.mockResolvedValue({ id: "p1" });
    await productService.getById(ctx, "p1");
    expect(mocked.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz-1" }) })
    );
  });

  it("throws NotFoundError for another tenant's product", async () => {
    mocked.product.findFirst.mockResolvedValue(null);
    await expect(productService.getById(ctx, "someone-elses")).rejects.toThrow(NotFoundError);
  });
});

describe("productService.adjustStock", () => {
  it("writes an ADJUSTMENT movement with a signed delta", async () => {
    mocked.product.findFirst.mockResolvedValue({ id: "p1", quantity: 10, minimumStock: 2, images: [] });
    tx.product.update.mockResolvedValue({ id: "p1", name: "Widget", quantity: 4, minimumStock: 2 });

    await productService.adjustStock(ctx, { id: "p1", newQuantity: 4, reason: "Damaged units" });

    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ADJUSTMENT", quantity: -6, quantityBefore: 10, quantityAfter: 4, reason: "Damaged units",
        }),
      })
    );
  });

  it("regression: raises a LOW_STOCK alert when a manual adjustment drops quantity to/below minimumStock (mirrors sale/purchase behavior)", async () => {
    mocked.product.findFirst.mockResolvedValue({ id: "p1", quantity: 10, minimumStock: 5, images: [] });
    tx.product.update.mockResolvedValue({ id: "p1", name: "Widget", quantity: 3, minimumStock: 5 });
    tx.notification.findFirst.mockResolvedValue(null);

    await productService.adjustStock(ctx, { id: "p1", newQuantity: 3, reason: "Recount" });

    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "LOW_STOCK", businessId: "biz-1" }),
      })
    );
  });

  it("does not raise a duplicate LOW_STOCK alert if one is already open for this product", async () => {
    mocked.product.findFirst.mockResolvedValue({ id: "p1", quantity: 10, minimumStock: 5, images: [] });
    tx.product.update.mockResolvedValue({ id: "p1", name: "Widget", quantity: 3, minimumStock: 5 });
    tx.notification.findFirst.mockResolvedValue({ id: "existing-alert" });

    await productService.adjustStock(ctx, { id: "p1", newQuantity: 3, reason: "Recount" });

    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it("rejects a no-op adjustment", async () => {
    mocked.product.findFirst.mockResolvedValue({ id: "p1", quantity: 10, images: [] });
    await expect(
      productService.adjustStock(ctx, { id: "p1", newQuantity: 10, reason: "same" })
    ).rejects.toThrow(ValidationError);
  });
});

describe("productService.softDelete", () => {
  it("only deletes rows owned by the tenant", async () => {
    mocked.product.findMany.mockResolvedValue([{ id: "p1" }]); // p2 filtered out by the ownership query
    tx.product.updateMany.mockResolvedValue({ count: 1 });

    const result = await productService.softDelete(ctx, ["p1", "p2-other-tenant"]);

    expect(result.count).toBe(1);
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["p1"] } } })
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("throws when nothing is owned", async () => {
    mocked.product.findMany.mockResolvedValue([]);
    await expect(productService.softDelete(ctx, ["nope"])).rejects.toThrow(NotFoundError);
  });
});

describe("productService.permanentDelete", () => {
  it("refuses when the product has sales history", async () => {
    mocked.product.findFirst.mockResolvedValue({ id: "p1", _count: { saleItems: 3 } });
    await expect(productService.permanentDelete(ctx, "p1")).rejects.toThrow(/sales history/);
    expect(tx.product.delete).not.toHaveBeenCalled();
  });
});
