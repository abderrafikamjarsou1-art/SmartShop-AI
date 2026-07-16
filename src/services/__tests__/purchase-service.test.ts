import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Purchase service tests.
 * Unit tests: rules in isolation (idempotency, over-receive, guards).
 * Integration-style test: a full lifecycle sequence against the mocked
 * store — create -> receive partial -> receive rest -> verify status
 * transitions and that stock/movement math stays consistent.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/services/stock-alerts", () => ({ syncLowStockAlert: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    purchase: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
    purchaseItem: { update: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    purchaseReceipt: { create: vi.fn() },
    product: { update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    notification: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: {
      purchase: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      purchaseReceipt: { findFirst: vi.fn() },
      purchaseItem: { findMany: vi.fn() },
      supplier: { findFirst: vi.fn(), findMany: vi.fn() },
      product: { findMany: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[])
      ),
      $queryRaw: vi.fn().mockResolvedValue([]),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { purchaseService } from "@/services/purchase-service";
import { ValidationError, ConflictError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocked = prisma as any;
const tx = mocked.__tx;

const ctx = {
  businessId: "biz-1", role: "OWNER",
  user: { id: "user-1" },
  business: { id: "biz-1", currency: "MAD" },
} as unknown as TenantContext;

const CREF = "33333333-3333-3333-3333-333333333333";

function poWith(items: Partial<{ id: string; quantity: number; receivedQuantity: number; returnedQuantity: number; unitCost: number; productId: string }>[]) {
  return {
    id: "po1", purchaseNumber: 7, status: "ORDERED",
    supplier: { name: "TechDistrib" },
    receipts: [],
    items: items.map((i, n) => ({
      id: i.id ?? `pi${n}`, productId: i.productId ?? `p${n}`,
      quantity: i.quantity ?? 10, receivedQuantity: i.receivedQuantity ?? 0,
      returnedQuantity: i.returnedQuantity ?? 0, unitCost: i.unitCost ?? 50,
      product: { id: i.productId ?? `p${n}`, name: `Product ${n}`, sku: `S${n}` },
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.purchaseReceipt.findFirst.mockResolvedValue(null);
  tx.product.update.mockImplementation(async (args: { data: { quantity?: { increment: number } } }) => ({
    id: "p0", name: "Product 0", quantity: 5 + (args.data.quantity?.increment ?? 0), minimumStock: 2,
  }));
  tx.purchase.findUniqueOrThrow.mockResolvedValue({ id: "po1" });
});

describe("purchaseService.receive — idempotency (NEVER duplicate inventory)", () => {
  it("replay with the same clientRef is a no-op: zero writes", async () => {
    mocked.purchaseReceipt.findFirst.mockResolvedValue({ id: "r1" }); // already received
    mocked.purchase.findFirst.mockResolvedValue(poWith([{}]));

    await purchaseService.receive(ctx, {
      purchaseId: "po1", clientRef: CREF,
      items: [{ purchaseItemId: "pi0", quantity: 5 }], updateProductCost: false,
    });

    expect(mocked.$transaction).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("the receipt row is written FIRST, carrying the clientRef", async () => {
    mocked.purchase.findFirst.mockResolvedValue(poWith([{}]));
    tx.purchaseItem.findMany.mockResolvedValue([{ quantity: 10, receivedQuantity: 5 }]);

    await purchaseService.receive(ctx, {
      purchaseId: "po1", clientRef: CREF,
      items: [{ purchaseItemId: "pi0", quantity: 5 }], updateProductCost: false,
    });

    expect(tx.purchaseReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientRef: CREF }) })
    );
    const receiptOrder = tx.purchaseReceipt.create.mock.invocationCallOrder[0];
    const movementOrder = tx.inventoryMovement.create.mock.invocationCallOrder[0];
    expect(receiptOrder).toBeLessThan(movementOrder);
  });
});

describe("purchaseService.receive — partial receiving", () => {
  it("rejects receiving more than what remains open", async () => {
    mocked.purchase.findFirst.mockResolvedValue(poWith([{ quantity: 10, receivedQuantity: 8 }]));
    await expect(
      purchaseService.receive(ctx, {
        purchaseId: "po1", clientRef: CREF,
        items: [{ purchaseItemId: "pi0", quantity: 3 }], updateProductCost: false,
      })
    ).rejects.toThrow(/still expected/);
  });

  it("partial receive -> PARTIALLY_RECEIVED with a PURCHASE movement mirroring the increment", async () => {
    mocked.purchase.findFirst.mockResolvedValue(poWith([{ quantity: 10 }]));
    tx.purchaseItem.findMany.mockResolvedValue([{ quantity: 10, receivedQuantity: 4 }]);

    await purchaseService.receive(ctx, {
      purchaseId: "po1", clientRef: CREF,
      items: [{ purchaseItemId: "pi0", quantity: 4 }], updateProductCost: false,
    });

    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "PURCHASE", quantity: 4, quantityBefore: 5, quantityAfter: 9 }),
      })
    );
    expect(tx.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PARTIALLY_RECEIVED" }) })
    );
  });

  it("cost update flag copies unitCost to the product; PO line stays untouched", async () => {
    mocked.purchase.findFirst.mockResolvedValue(poWith([{ unitCost: 42 }]));
    tx.purchaseItem.findMany.mockResolvedValue([{ quantity: 10, receivedQuantity: 10 }]);

    await purchaseService.receive(ctx, {
      purchaseId: "po1", clientRef: CREF,
      items: [{ purchaseItemId: "pi0", quantity: 10 }], updateProductCost: true,
    });

    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ buyingPrice: 42 }) })
    );
    // Historical record preserved: purchaseItem update only increments receivedQuantity
    expect(tx.purchaseItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { receivedQuantity: { increment: 10 } } })
    );
  });
});

describe("purchaseService.processReturn", () => {
  it("rejects returning more than received-minus-already-returned", async () => {
    mocked.purchase.findFirst.mockResolvedValue(poWith([{ receivedQuantity: 5, returnedQuantity: 4 }]));
    await expect(
      purchaseService.processReturn(ctx, {
        purchaseId: "po1", items: [{ purchaseItemId: "pi0", quantity: 2 }], reason: "damaged",
      })
    ).rejects.toThrow(/can be returned/);
  });

  it("uses a stock guard: can't ship back units already sold", async () => {
    mocked.purchase.findFirst.mockResolvedValue(poWith([{ receivedQuantity: 5 }]));
    tx.product.updateMany.mockResolvedValue({ count: 0 }); // stock < return qty
    await expect(
      purchaseService.processReturn(ctx, {
        purchaseId: "po1", items: [{ purchaseItemId: "pi0", quantity: 5 }], reason: "wrong item",
      })
    ).rejects.toThrow(ConflictError);
  });

  it("writes a negative RETURN movement (stock out)", async () => {
    mocked.purchase.findFirst.mockResolvedValue(poWith([{ receivedQuantity: 5 }]));
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.product.findUniqueOrThrow.mockResolvedValue({ id: "p0", name: "Product 0", quantity: 3, minimumStock: 2 });

    await purchaseService.processReturn(ctx, {
      purchaseId: "po1", items: [{ purchaseItemId: "pi0", quantity: 2 }], reason: "damaged",
    });

    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "RETURN", quantity: -2 }) })
    );
  });
});

describe("lifecycle integration: create -> receive partial -> receive rest", () => {
  it("walks DRAFT -> ORDERED -> PARTIALLY_RECEIVED -> RECEIVED with consistent stock math", async () => {
    // create draft
    mocked.supplier.findFirst.mockResolvedValue({ id: "sup1", name: "TechDistrib" });
    mocked.product.findMany.mockResolvedValue([{ id: "p0" }]);
    tx.purchase.findFirst.mockResolvedValue({ purchaseNumber: 6 });
    tx.purchase.create.mockResolvedValue(poWith([{ quantity: 10 }]));
    const draft = await purchaseService.create(ctx, {
      supplierId: "sup1", status: "DRAFT",
      items: [{ productId: "p0", quantity: 10, unitCost: 50 }],
    });
    expect(tx.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT", subtotal: 500 }) })
    );

    // send
    mocked.purchase.findFirst.mockResolvedValue({ ...draft, status: "DRAFT", items: draft.items });
    tx.purchase.update.mockResolvedValue({ ...draft, status: "ORDERED" });
    await purchaseService.send(ctx, "po1");
    expect(tx.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ORDERED" }) })
    );

    // receive 6 of 10
    vi.clearAllMocks();
    mocked.purchaseReceipt.findFirst.mockResolvedValue(null);
    mocked.purchase.findFirst.mockResolvedValue(poWith([{ quantity: 10, receivedQuantity: 0 }]));
    tx.product.update.mockResolvedValue({ id: "p0", name: "Product 0", quantity: 11, minimumStock: 2 });
    tx.purchaseItem.findMany.mockResolvedValue([{ quantity: 10, receivedQuantity: 6 }]);
    tx.purchase.findUniqueOrThrow.mockResolvedValue({ id: "po1" });
    await purchaseService.receive(ctx, {
      purchaseId: "po1", clientRef: crypto.randomUUID(),
      items: [{ purchaseItemId: "pi0", quantity: 6 }], updateProductCost: false,
    });
    expect(tx.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PARTIALLY_RECEIVED", receivedAt: null }) })
    );

    // receive remaining 4
    vi.clearAllMocks();
    mocked.purchaseReceipt.findFirst.mockResolvedValue(null);
    mocked.purchase.findFirst.mockResolvedValue(poWith([{ quantity: 10, receivedQuantity: 6 }]));
    tx.product.update.mockResolvedValue({ id: "p0", name: "Product 0", quantity: 15, minimumStock: 2 });
    tx.purchaseItem.findMany.mockResolvedValue([{ quantity: 10, receivedQuantity: 10 }]);
    tx.purchase.findUniqueOrThrow.mockResolvedValue({ id: "po1" });
    await purchaseService.receive(ctx, {
      purchaseId: "po1", clientRef: crypto.randomUUID(),
      items: [{ purchaseItemId: "pi0", quantity: 4 }], updateProductCost: false,
    });
    expect(tx.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RECEIVED", receivedAt: expect.any(Date) }) })
    );
    // second receipt: only the remaining 4 moved
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 4 }) })
    );
  });

  it("over-receiving the remainder is rejected (6 received, 5 requested of 10)", async () => {
    mocked.purchaseReceipt.findFirst.mockResolvedValue(null);
    mocked.purchase.findFirst.mockResolvedValue(poWith([{ quantity: 10, receivedQuantity: 6 }]));
    await expect(
      purchaseService.receive(ctx, {
        purchaseId: "po1", clientRef: CREF,
        items: [{ purchaseItemId: "pi0", quantity: 5 }], updateProductCost: false,
      })
    ).rejects.toThrow(ValidationError);
  });
});
