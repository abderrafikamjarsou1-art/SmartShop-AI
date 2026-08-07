import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { syncLowStockAlert } from "@/services/stock-alerts";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { round2 } from "@/lib/sale-math";
import { csvToObjects } from "@/lib/csv";
import type { TenantContext } from "@/lib/tenant";
import type {
  CreatePurchaseInput, UpdateDraftPurchaseInput, ReceivePurchaseInput,
  PurchaseReturnInput, PurchaseFilter,
} from "@/lib/validation/purchase";
import { purchaseCsvRowSchema } from "@/lib/validation/purchase";

/**
 * Purchase service.
 *
 * INVARIANTS:
 *  1. Receiving is IDEMPOTENT: every receive event carries a clientRef;
 *     the PurchaseReceipt unique constraint turns replays into no-ops.
 *     Inventory can never be duplicated.
 *  2. A receive event = receipt + item increments + stock increments +
 *     PURCHASE movements + optional cost update + alerts + audit +
 *     notification, in ONE transaction.
 *  3. unitCost on PurchaseItem is the immutable historical record —
 *     receiving may optionally copy it to Product.buyingPrice, but the
 *     PO line itself is never rewritten.
 */

const purchaseInclude = {
  supplier: { select: { id: true, name: true, email: true, phone: true } },
  user: { select: { fullName: true, email: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
  receipts: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.PurchaseInclude;

export type PurchaseWithRelations = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

function computePurchaseTotals(items: { quantity: number; unitCost: number }[]) {
  const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
  return { subtotal, total: subtotal }; // supplier tax handling arrives with Expenses/VAT step
}

/**
 * Verify a supplierId + a set of productIds all belong to the tenant
 * before they're written onto a purchase order. Shared by create() and
 * updateDraft() — a client-supplied id is never trusted without this.
 */
async function verifyPurchaseOwnership(ctx: TenantContext, supplierId: string, productIds: string[]) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, businessId: ctx.businessId, deletedAt: null },
  });
  if (!supplier) throw new NotFoundError("Supplier");

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, businessId: ctx.businessId, deletedAt: null },
    select: { id: true },
  });
  if (products.length !== new Set(productIds).size) {
    throw new NotFoundError("Product");
  }
  return supplier;
}

export const purchaseService = {
  // ---------------------------------------------------------------
  // CREATE / DRAFT / SEND / CANCEL
  // ---------------------------------------------------------------
  async create(ctx: TenantContext, input: CreatePurchaseInput) {
    const supplier = await verifyPurchaseOwnership(ctx, input.supplierId, input.items.map((i) => i.productId));

    const totals = computePurchaseTotals(input.items);

    return prisma.$transaction(async (tx) => {
      const last = await tx.purchase.findFirst({
        where: { businessId: ctx.businessId },
        orderBy: { purchaseNumber: "desc" },
        select: { purchaseNumber: true },
      });

      const purchase = await tx.purchase.create({
        data: {
          businessId: ctx.businessId,
          supplierId: input.supplierId,
          userId: ctx.user.id,
          purchaseNumber: (last?.purchaseNumber ?? 0) + 1,
          status: input.status,
          sentAt: input.status === "ORDERED" ? new Date() : null,
          subtotal: totals.subtotal,
          total: totals.total,
          expectedAt: input.expectedAt ?? null,
          notes: input.notes ?? null,
          items: {
            create: input.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitCost: i.unitCost,           // HISTORICAL COST — never rewritten
              total: round2(i.quantity * i.unitCost),
            })),
          },
        },
        include: purchaseInclude,
      });

      await audit(tx, ctx, input.status === "DRAFT" ? "purchase.draft" : "purchase.order", "Purchase", purchase.id, {
        purchaseNumber: purchase.purchaseNumber, supplier: supplier.name, total: totals.total,
      });
      return purchase;
    });
  },

  async updateDraft(ctx: TenantContext, input: UpdateDraftPurchaseInput) {
    const purchase = await this.getById(ctx, input.id);
    if (purchase.status !== "DRAFT") throw new ValidationError("Only draft purchase orders can be edited.");

    // Same ownership guard as create() — a draft edit can't smuggle in
    // another tenant's supplier/products.
    await verifyPurchaseOwnership(ctx, input.supplierId, input.items.map((i) => i.productId));

    const totals = computePurchaseTotals(input.items);
    return prisma.$transaction(async (tx) => {
      await tx.purchaseItem.deleteMany({ where: { purchaseId: purchase.id } });
      const updated = await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          supplierId: input.supplierId,
          subtotal: totals.subtotal, total: totals.total,
          expectedAt: input.expectedAt ?? null,
          notes: input.notes ?? null,
          items: {
            create: input.items.map((i) => ({
              productId: i.productId, quantity: i.quantity, unitCost: i.unitCost,
              total: round2(i.quantity * i.unitCost),
            })),
          },
        },
        include: purchaseInclude,
      });
      await audit(tx, ctx, "purchase.draft_update", "Purchase", purchase.id, { total: totals.total });
      return updated;
    });
  },

  /** DRAFT -> ORDERED. From here the PO is receivable and lines are frozen. */
  async send(ctx: TenantContext, id: string) {
    const purchase = await this.getById(ctx, id);
    if (purchase.status !== "DRAFT") throw new ValidationError("Only drafts can be sent.");
    return prisma.$transaction(async (tx) => {
      const sent = await tx.purchase.update({
        where: { id }, data: { status: "ORDERED", sentAt: new Date() }, include: purchaseInclude,
      });
      await audit(tx, ctx, "purchase.send", "Purchase", id, { purchaseNumber: purchase.purchaseNumber });
      return sent;
    });
  },

  async cancel(ctx: TenantContext, id: string) {
    const purchase = await this.getById(ctx, id);
    if (!["DRAFT", "ORDERED"].includes(purchase.status)) {
      throw new ValidationError("Only unreceived purchase orders can be cancelled.");
    }
    if (purchase.items.some((i) => i.receivedQuantity > 0)) {
      throw new ValidationError("This order has received items — return them to the supplier instead.");
    }
    return prisma.$transaction(async (tx) => {
      const cancelled = await tx.purchase.update({ where: { id }, data: { status: "CANCELLED" } });
      await audit(tx, ctx, "purchase.cancel", "Purchase", id);
      return cancelled;
    });
  },

  // ---------------------------------------------------------------
  // RECEIVING — partial or full, IDEMPOTENT
  // ---------------------------------------------------------------
  async receive(ctx: TenantContext, input: ReceivePurchaseInput) {
    // IDEMPOTENCY GATE: same clientRef -> the receipt already happened.
    const existing = await prisma.purchaseReceipt.findFirst({
      where: { businessId: ctx.businessId, clientRef: input.clientRef },
    });
    if (existing) return this.getById(ctx, input.purchaseId);

    const purchase = await this.getById(ctx, input.purchaseId);
    if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(purchase.status)) {
      throw new ValidationError("Only sent purchase orders can be received.");
    }
    const byId = new Map(purchase.items.map((i) => [i.id, i]));

    // Pre-flight: never receive more than what remains open on a line.
    // Tracks a running total per line — input.items can repeat the same
    // purchaseItemId, and checking each entry against the same static
    // "remaining" snapshot would let duplicate lines over-receive.
    const requestedByLine = new Map<string, number>();
    for (const r of input.items) {
      const item = byId.get(r.purchaseItemId);
      if (!item) throw new NotFoundError("Purchase line");
      const remaining = item.quantity - item.receivedQuantity;
      const requestedSoFar = (requestedByLine.get(r.purchaseItemId) ?? 0) + r.quantity;
      requestedByLine.set(r.purchaseItemId, requestedSoFar);
      if (requestedSoFar > remaining) {
        throw new ValidationError(`Only ${remaining} unit(s) of “${item.product.name}” are still expected.`);
      }
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // The receipt row is created FIRST — its unique(businessId, clientRef)
        // makes a concurrent duplicate fail the whole transaction (P2002).
        await tx.purchaseReceipt.create({
          data: {
            businessId: ctx.businessId,
            purchaseId: purchase.id,
            userId: ctx.user.id,
            clientRef: input.clientRef,
            lines: input.items,
            notes: input.notes ?? null,
          },
        });

        for (const r of input.items) {
          const item = byId.get(r.purchaseItemId)!;

          await tx.purchaseItem.update({
            where: { id: item.id },
            data: { receivedQuantity: { increment: r.quantity } },
          });

          const product = await tx.product.update({
            where: { id: item.productId, businessId: ctx.businessId },
            data: {
              quantity: { increment: r.quantity },
              // OPTIONAL cost update: copy the PO's negotiated cost onto the
              // product. The PO line itself stays untouched (history preserved).
              ...(input.updateProductCost ? { buyingPrice: item.unitCost } : {}),
            },
          });

          await tx.inventoryMovement.create({
            data: {
              businessId: ctx.businessId,
              productId: item.productId,
              userId: ctx.user.id,
              type: "PURCHASE",
              quantity: r.quantity,
              quantityBefore: product.quantity - r.quantity,
              quantityAfter: product.quantity,
              reason: `PO #${purchase.purchaseNumber}`,
              purchaseId: purchase.id,
            },
          });

          // Receiving stock is exactly when low-stock alerts auto-resolve
          await syncLowStockAlert(tx, ctx, product);
        }

        // Recompute status from the lines
        const items = await tx.purchaseItem.findMany({ where: { purchaseId: purchase.id } });
        const fullyReceived = items.every((i) => i.receivedQuantity >= i.quantity);
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
            receivedAt: fullyReceived ? new Date() : null,
          },
        });

        await tx.notification.create({
          data: {
            businessId: ctx.businessId,
            userId: null,
            type: "SYSTEM",
            title: fullyReceived
              ? `PO #${purchase.purchaseNumber} fully received`
              : `PO #${purchase.purchaseNumber} partially received`,
            message: `${input.items.reduce((s, i) => s + i.quantity, 0)} unit(s) from ${purchase.supplier?.name ?? "supplier"} added to stock.`,
            link: `/purchases/${purchase.id}`,
          },
        });

        await audit(tx, ctx, "purchase.receive", "Purchase", purchase.id, {
          clientRef: input.clientRef, lines: input.items, costUpdated: input.updateProductCost,
        });

        return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: purchaseInclude });
      });
    } catch (e) {
      // Concurrent duplicate receipt -> treat as the idempotent no-op it is
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return this.getById(ctx, input.purchaseId);
      }
      throw e;
    }
  },

  // ---------------------------------------------------------------
  // PURCHASE RETURNS — send received units back to the supplier
  // ---------------------------------------------------------------
  async processReturn(ctx: TenantContext, input: PurchaseReturnInput) {
    const purchase = await this.getById(ctx, input.purchaseId);
    const byId = new Map(purchase.items.map((i) => [i.id, i]));
    // Running total per line — same reasoning as receive()'s pre-flight:
    // a repeated purchaseItemId within one request must not be able to
    // over-return by validating each entry against a stale snapshot.
    const returnedInThisRequest = new Map<string, number>();

    return prisma.$transaction(async (tx) => {
      for (const r of input.items) {
        const item = byId.get(r.purchaseItemId);
        if (!item) throw new NotFoundError("Purchase line");
        const returnable = item.receivedQuantity - item.returnedQuantity;
        const requestedSoFar = (returnedInThisRequest.get(r.purchaseItemId) ?? 0) + r.quantity;
        returnedInThisRequest.set(r.purchaseItemId, requestedSoFar);
        if (requestedSoFar > returnable) {
          throw new ValidationError(`Only ${returnable} received unit(s) of “${item.product.name}” can be returned.`);
        }

        // Stock guard: we can't ship back units already sold
        const guarded = await tx.product.updateMany({
          where: { id: item.productId, businessId: ctx.businessId, quantity: { gte: r.quantity } },
          data: { quantity: { decrement: r.quantity } },
        });
        if (guarded.count === 0) {
          throw new ConflictError(`Not enough stock of “${item.product.name}” on hand to return (some may be sold).`);
        }

        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { returnedQuantity: { increment: r.quantity } },
        });

        const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId, businessId: ctx.businessId } });
        await tx.inventoryMovement.create({
          data: {
            businessId: ctx.businessId,
            productId: item.productId,
            userId: ctx.user.id,
            type: "RETURN",
            quantity: -r.quantity, // stock OUT — signed ledger keeps one type honest
            quantityBefore: product.quantity + r.quantity,
            quantityAfter: product.quantity,
            reason: `Return to supplier — PO #${purchase.purchaseNumber}: ${input.reason}`,
            purchaseId: purchase.id,
          },
        });
        await syncLowStockAlert(tx, ctx, product);
      }

      await audit(tx, ctx, "purchase.return", "Purchase", purchase.id, {
        lines: input.items, reason: input.reason,
      });
      return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: purchaseInclude });
    });
  },

  // ---------------------------------------------------------------
  // READS
  // ---------------------------------------------------------------
  async getById(ctx: TenantContext, id: string): Promise<PurchaseWithRelations> {
    const purchase = await prisma.purchase.findFirst({
      where: { id, businessId: ctx.businessId },
      include: purchaseInclude,
    });
    if (!purchase) throw new NotFoundError("Purchase order");
    return purchase;
  },

  async list(ctx: TenantContext, filter: PurchaseFilter) {
    const where: Prisma.PurchaseWhereInput = {
      businessId: ctx.businessId,
      ...(filter.status && { status: filter.status }),
      ...(filter.supplierId && { supplierId: filter.supplierId }),
      ...((filter.from || filter.to) && {
        createdAt: {
          ...(filter.from && { gte: filter.from }),
          ...(filter.to && { lte: endOfDay(filter.to) }),
        },
      }),
      ...(filter.q && {
        OR: [
          ...(Number.isInteger(Number(filter.q)) ? [{ purchaseNumber: Number(filter.q) }] : []),
          { supplier: { name: { contains: filter.q, mode: "insensitive" as const } } },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.purchase.findMany({
        where,
        include: {
          supplier: { select: { name: true } },
          items: { select: { quantity: true, receivedQuantity: true } },
        },
        orderBy: { createdAt: filter.sortDir },
        skip: (filter.page - 1) * filter.perPage,
        take: filter.perPage,
      }),
      prisma.purchase.count({ where }),
    ]);
    return { items, total, page: filter.page, totalPages: Math.max(1, Math.ceil(total / filter.perPage)) };
  },

  /** Dropdown data for the purchase form (suppliers + products). */
  async getFormOptions(ctx: TenantContext) {
    const [suppliers, productRows] = await Promise.all([
      prisma.supplier.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: { id: true, name: true }, orderBy: { name: "asc" },
      }),
      prisma.product.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: { id: true, name: true, sku: true, buyingPrice: true },
        orderBy: { name: "asc" }, take: 500,
      }),
    ]);
    return {
      suppliers,
      products: productRows.map((p) => ({
        id: p.id, name: p.name, sku: p.sku, buyingPrice: Number(p.buyingPrice),
      })),
    };
  },

  // ---------------------------------------------------------------
  // COST INTELLIGENCE
  // ---------------------------------------------------------------
  /** Full cost history for a product: every PO line ever, newest first. */
  async getCostHistory(ctx: TenantContext, productId: string) {
    return prisma.purchaseItem.findMany({
      where: {
        productId,
        purchase: { businessId: ctx.businessId, status: { in: ["PARTIALLY_RECEIVED", "RECEIVED"] } },
      },
      select: {
        unitCost: true, quantity: true, receivedQuantity: true,
        purchase: {
          select: { purchaseNumber: true, createdAt: true, supplier: { select: { name: true } } },
        },
      },
      orderBy: { purchase: { createdAt: "desc" } },
      take: 20,
    });
  },

  /** Supplier pricing: last negotiated cost per supplier for a product. */
  async getSupplierPricing(ctx: TenantContext, productId: string) {
    const rows = await prisma.$queryRaw<{ supplier: string; unitCost: number; date: Date }[]>`
      SELECT DISTINCT ON (s.id)
        s.name AS supplier, pi."unitCost"::float AS "unitCost", p."createdAt" AS date
      FROM purchase_items pi
      JOIN purchases p ON p.id = pi."purchaseId"
      JOIN suppliers s ON s.id = p."supplierId"
      WHERE p."businessId" = ${ctx.businessId}::uuid AND pi."productId" = ${productId}::uuid
      ORDER BY s.id, p."createdAt" DESC
    `;
    return rows.sort((a, b) => a.unitCost - b.unitCost); // cheapest first
  },

  // ---------------------------------------------------------------
  // CSV IMPORT -> draft PO (header: sku,quantity,unitCost)
  // ---------------------------------------------------------------
  async importCsvAsDraft(ctx: TenantContext, supplierId: string, csvText: string) {
    const { headers, objects } = csvToObjects(csvText);
    for (const h of ["sku", "quantity", "unitcost"]) {
      if (!headers.includes(h)) throw new ValidationError(`Missing column “${h}”. Expected header: sku,quantity,unitCost`);
    }

    const errors: { row: number; sku: string; error: string }[] = [];
    const parsed = objects.flatMap((obj, i) => {
      const r = purchaseCsvRowSchema.safeParse({ sku: obj["sku"], quantity: obj["quantity"], unitCost: obj["unitcost"] });
      if (!r.success) { errors.push({ row: i + 1, sku: obj["sku"] ?? "?", error: r.error.issues[0].message }); return []; }
      return [r.data];
    });
    if (parsed.length === 0) throw new ValidationError("No valid rows found.", );

    const products = await prisma.product.findMany({
      where: { businessId: ctx.businessId, deletedAt: null, sku: { in: parsed.map((r) => r.sku) } },
      select: { id: true, sku: true },
    });
    const bySku = new Map(products.map((p) => [p.sku!, p.id]));

    const items: { productId: string; quantity: number; unitCost: number }[] = [];
    parsed.forEach((r, i) => {
      const productId = bySku.get(r.sku);
      if (!productId) errors.push({ row: i + 1, sku: r.sku, error: "SKU not found." });
      else items.push({ productId, quantity: r.quantity, unitCost: r.unitCost });
    });
    if (items.length === 0) throw new ValidationError("No rows matched existing products.");

    const purchase = await this.create(ctx, { supplierId, status: "DRAFT", items });
    return { purchase, imported: items.length, errors };
  },
};

function endOfDay(d: Date) { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; }
