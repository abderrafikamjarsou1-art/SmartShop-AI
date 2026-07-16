import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Inventory service tests — Prisma mocked. Focus: bulk adjust
 * classification, atomic mode, ledger side effects, alert sync.
 */

vi.mock("server-only", () => ({}));

const alertMock = vi.fn();
vi.mock("@/services/stock-alerts", () => ({ syncLowStockAlert: (...args: unknown[]) => alertMock(...args) }));

vi.mock("@/lib/prisma", () => {
  const tx = {
    product: { update: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    notification: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  return {
    prisma: {
      product: { findMany: vi.fn(), aggregate: vi.fn() },
      inventoryMovement: { findMany: vi.fn(), count: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[])
      ),
      $queryRaw: vi.fn().mockResolvedValue([]),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { inventoryService } from "@/services/inventory-service";
import { ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocked = prisma as any;
const tx = mocked.__tx;

const ctx = {
  businessId: "biz-1",
  user: { id: "user-1" },
  role: "OWNER",
  business: { id: "biz-1" },
} as unknown as TenantContext;

beforeEach(() => { vi.clearAllMocks(); alertMock.mockReset(); });

const productA = { id: "pa", sku: "A1", name: "Product A", quantity: 10, minimumStock: 3 };
const productB = { id: "pb", sku: "B1", name: "Product B", quantity: 5, minimumStock: 2 };

describe("inventoryService.bulkAdjust", () => {
  it("applies valid rows and reports unknown SKUs + no-ops as skipped", async () => {
    mocked.product.findMany.mockResolvedValue([productA, productB]);

    const result = await inventoryService.bulkAdjust(ctx, {
      atomic: false,
      rows: [
        { sku: "A1", newQuantity: 4, reason: "count" },   // valid: 10 -> 4
        { sku: "B1", newQuantity: 5, reason: "count" },   // no-op: skipped
        { sku: "ZZ", newQuantity: 1, reason: "count" },   // unknown: skipped
      ],
    });

    expect(result.applied).toBe(1);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.map((s) => s.sku).sort()).toEqual(["B1", "ZZ"]);

    // Ledger entry with signed delta + snapshots
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ADJUSTMENT", quantity: -6, quantityBefore: 10, quantityAfter: 4,
        }),
      })
    );
    // One audit for the batch
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "inventory.bulk_adjust" }) })
    );
    // Alert hook ran with the NEW quantity
    expect(alertMock).toHaveBeenCalledWith(tx, ctx, expect.objectContaining({ id: "pa", quantity: 4 }));
  });

  it("atomic mode aborts everything when any row has a problem", async () => {
    mocked.product.findMany.mockResolvedValue([productA]);

    await expect(
      inventoryService.bulkAdjust(ctx, {
        atomic: true,
        rows: [
          { sku: "A1", newQuantity: 4, reason: "count" },
          { sku: "ZZ", newQuantity: 1, reason: "count" },
        ],
      })
    ).rejects.toThrow(ValidationError);

    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("resolves SKUs tenant-scoped", async () => {
    mocked.product.findMany.mockResolvedValue([]);
    await inventoryService.bulkAdjust(ctx, {
      atomic: false, rows: [{ sku: "A1", newQuantity: 1, reason: "x" }],
    });
    expect(mocked.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz-1" }) })
    );
  });
});

describe("inventoryService.previewAdjust", () => {
  it("classifies rows without writing anything", async () => {
    mocked.product.findMany.mockResolvedValue([productA]);

    const preview = await inventoryService.previewAdjust(ctx, [
      { sku: "A1", newQuantity: 7, reason: "x" },
      { sku: "GONE", newQuantity: 2, reason: "x" },
    ]);

    expect(preview.valid).toEqual([
      { row: 1, sku: "A1", productName: "Product A", from: 10, to: 7 },
    ]);
    expect(preview.errors[0]).toMatchObject({ row: 2, sku: "GONE" });
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });
});

describe("inventoryService.listMovements", () => {
  it("builds a tenant-scoped where with type and date range", async () => {
    mocked.$transaction.mockResolvedValueOnce([[], 0]);

    await inventoryService.listMovements(ctx, {
      page: 1, perPage: 20, sortDir: "desc",
      type: "SALE", from: new Date("2026-07-01"), to: new Date("2026-07-05"),
    });

    expect(mocked.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-1",
          type: "SALE",
          createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
        }),
      })
    );
  });
});
