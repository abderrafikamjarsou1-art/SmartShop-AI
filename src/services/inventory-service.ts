import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { syncLowStockAlert } from "@/services/stock-alerts";
import { ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import type {
  MovementFilter, BulkAdjustInput, BulkAdjustResult, ImportRow,
} from "@/lib/validation/inventory";

/**
 * Inventory service — the ledger is the source of truth; everything here
 * either reads it (dashboard, analytics, history) or appends to it
 * (bulk adjustments). Same contract as productService: ctx first,
 * tenant scope always, ApiErrors only, transactions for writes.
 */

export const inventoryService = {
  // ---------------------------------------------------------------
  // DASHBOARD STATS
  // ---------------------------------------------------------------
  async getDashboardStats(ctx: TenantContext) {
    const [totals, valuation, lowStock, recent] = await Promise.all([
      prisma.product.aggregate({
        where: { businessId: ctx.businessId, deletedAt: null },
        _count: true,
      }),
      // Stock value at cost AND at selling price, plus out-of-stock count
      prisma.$queryRaw<[{ costValue: number; retailValue: number; outOfStock: bigint }]>`
        SELECT
          COALESCE(SUM(quantity * "buyingPrice"), 0)::float  AS "costValue",
          COALESCE(SUM(quantity * "sellingPrice"), 0)::float AS "retailValue",
          COUNT(*) FILTER (WHERE quantity = 0)               AS "outOfStock"
        FROM products
        WHERE "businessId" = ${ctx.businessId}::uuid AND "deletedAt" IS NULL
      `,
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) AS count FROM products
        WHERE "businessId" = ${ctx.businessId}::uuid AND "deletedAt" IS NULL
          AND quantity > 0 AND quantity <= "minimumStock"
      `,
      prisma.inventoryMovement.findMany({
        where: { businessId: ctx.businessId, type: "ADJUSTMENT" },
        include: {
          product: { select: { name: true, sku: true } },
          user: { select: { fullName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

    return {
      totalProducts: totals._count,
      costValue: valuation[0].costValue,
      retailValue: valuation[0].retailValue,
      outOfStockCount: Number(valuation[0].outOfStock),
      lowStockCount: Number(lowStock[0].count),
      recentAdjustments: recent,
    };
  },

  /**
   * Inventory value trend (last 6 months). Exact historical valuation
   * would need price history; the standard approximation: walk the
   * ledger backwards from today's value using movement deltas priced
   * at current cost. Good enough for a trend line, cheap to compute.
   */
  async getValueTrend(ctx: TenantContext) {
    const rows = await prisma.$queryRaw<{ month: Date; delta: number }[]>`
      SELECT date_trunc('month', m."createdAt") AS month,
             COALESCE(SUM(m.quantity * p."buyingPrice"), 0)::float AS delta
      FROM inventory_movements m
      JOIN products p ON p.id = m."productId"
      WHERE m."businessId" = ${ctx.businessId}::uuid
        AND m."createdAt" >= date_trunc('month', now()) - interval '5 months'
      GROUP BY 1 ORDER BY 1
    `;

    const current = (await prisma.$queryRaw<[{ v: number }]>`
      SELECT COALESCE(SUM(quantity * "buyingPrice"), 0)::float AS v
      FROM products WHERE "businessId" = ${ctx.businessId}::uuid AND "deletedAt" IS NULL
    `)[0].v;

    // Walk backwards: value at end of month M = value(M+1) - deltas(M+1)
    const months: { month: string; value: number }[] = [];
    let running = current;
    const byMonth = new Map(rows.map((r) => [r.month.toISOString().slice(0, 7), r.delta]));
    for (let i = 0; i < 6; i++) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      months.unshift({ month: d.toLocaleString("en", { month: "short" }), value: Math.max(0, running) });
      running -= byMonth.get(key) ?? 0;
    }
    return months;
  },

  // ---------------------------------------------------------------
  // MOVEMENTS LEDGER
  // ---------------------------------------------------------------
  async listMovements(ctx: TenantContext, filter: MovementFilter) {
    const where: Prisma.InventoryMovementWhereInput = {
      businessId: ctx.businessId,
      ...(filter.productId && { productId: filter.productId }),
      ...(filter.userId && { userId: filter.userId }),
      ...(filter.type && { type: filter.type }),
      ...(filter.supplierId && { product: { supplierId: filter.supplierId } }),
      ...((filter.from || filter.to) && {
        createdAt: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: endOfDay(filter.to) }) },
      }),
      ...(filter.q && {
        OR: [
          { product: { name: { contains: filter.q, mode: "insensitive" } } },
          { product: { sku: { contains: filter.q, mode: "insensitive" } } },
          { reason: { contains: filter.q, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.inventoryMovement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: filter.sortDir },
        skip: (filter.page - 1) * filter.perPage,
        take: filter.perPage,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return { items, total, page: filter.page, totalPages: Math.max(1, Math.ceil(total / filter.perPage)) };
  },

  /** Options for ledger filters: this tenant's products, members, suppliers. */
  async getLedgerFilterOptions(ctx: TenantContext) {
    const [products, members, suppliers] = await Promise.all([
      prisma.product.findMany({
        where: { businessId: ctx.businessId },
        select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500,
      }),
      prisma.userBusiness.findMany({
        where: { businessId: ctx.businessId },
        select: { user: { select: { id: true, fullName: true, email: true } } },
      }),
      prisma.supplier.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: { id: true, name: true }, orderBy: { name: "asc" },
      }),
    ]);
    return {
      products,
      users: members.map((m) => ({ id: m.user.id, name: m.user.fullName ?? m.user.email })),
      suppliers,
    };
  },

  // ---------------------------------------------------------------
  // BULK ADJUSTMENT (manual rows or CSV import — same path)
  // ---------------------------------------------------------------
  async bulkAdjust(ctx: TenantContext, input: BulkAdjustInput): Promise<BulkAdjustResult> {
    // Resolve every SKU in one query — tenant-scoped
    const skus = input.rows.map((r) => r.sku);
    const products = await prisma.product.findMany({
      where: { businessId: ctx.businessId, deletedAt: null, sku: { in: skus } },
    });
    const bySku = new Map(products.map((p) => [p.sku!, p]));

    // Pre-flight: classify rows
    const valid: { row: number; product: (typeof products)[number]; data: ImportRow }[] = [];
    const skipped: BulkAdjustResult["skipped"] = [];
    input.rows.forEach((data, i) => {
      const product = bySku.get(data.sku);
      if (!product) skipped.push({ row: i + 1, sku: data.sku, error: "SKU not found." });
      else if (product.quantity === data.newQuantity)
        skipped.push({ row: i + 1, sku: data.sku, error: "Quantity unchanged — skipped." });
      else valid.push({ row: i + 1, product, data });
    });

    // Atomic mode: any problem row aborts the whole import
    if (input.atomic && skipped.length > 0) {
      throw new ValidationError(
        `Atomic import aborted: ${skipped.length} row(s) have problems (first: row ${skipped[0].row} — ${skipped[0].error})`
      );
    }
    if (valid.length === 0) return { applied: 0, skipped };

    // One transaction for ALL rows: movements + audit + alerts together.
    await prisma.$transaction(async (tx) => {
      for (const { product, data } of valid) {
        await tx.product.update({
          where: { id: product.id },
          data: { quantity: data.newQuantity },
        });
        await tx.inventoryMovement.create({
          data: {
            businessId: ctx.businessId,
            productId: product.id,
            userId: ctx.user.id,
            type: "ADJUSTMENT",
            quantity: data.newQuantity - product.quantity,
            quantityBefore: product.quantity,
            quantityAfter: data.newQuantity,
            reason: data.reason,
          },
        });
        await syncLowStockAlert(tx, ctx, { ...product, quantity: data.newQuantity });
      }
      await audit(tx, ctx, "inventory.bulk_adjust", "InventoryMovement", ctx.businessId, {
        applied: valid.length, skipped: skipped.length,
      });
    });

    return { applied: valid.length, skipped };
  },

  /**
   * Dry-run of bulkAdjust — same classification, zero writes.
   * Powers the import preview table ("what will happen if I confirm?").
   */
  async previewAdjust(ctx: TenantContext, rows: ImportRow[]) {
    const products = await prisma.product.findMany({
      where: { businessId: ctx.businessId, deletedAt: null, sku: { in: rows.map((r) => r.sku) } },
      select: { id: true, sku: true, name: true, quantity: true },
    });
    const bySku = new Map(products.map((p) => [p.sku!, p]));

    const valid: { row: number; sku: string; productName: string; from: number; to: number }[] = [];
    const errors: { row: number; sku: string; error: string }[] = [];
    rows.forEach((r, i) => {
      const p = bySku.get(r.sku);
      if (!p) errors.push({ row: i + 1, sku: r.sku, error: "SKU not found." });
      else if (p.quantity === r.newQuantity) errors.push({ row: i + 1, sku: r.sku, error: "Quantity unchanged — will be skipped." });
      else valid.push({ row: i + 1, sku: r.sku, productName: p.name, from: p.quantity, to: r.newQuantity });
    });
    return { valid, errors, totalRows: rows.length };
  },

  // ---------------------------------------------------------------
  // ANALYTICS — turnover, fast/slow movers, dead stock, valuation
  // ---------------------------------------------------------------
  async getAnalytics(ctx: TenantContext) {
    // Units sold per product, last 30 days (SALE movements are negative)
    const sold30 = await prisma.$queryRaw<{ productId: string; name: string; sold: number; quantity: number }[]>`
      SELECT p.id AS "productId", p.name, COALESCE(SUM(-m.quantity), 0)::int AS sold, p.quantity
      FROM products p
      LEFT JOIN inventory_movements m
        ON m."productId" = p.id AND m.type = 'SALE'
        AND m."createdAt" >= now() - interval '30 days'
      WHERE p."businessId" = ${ctx.businessId}::uuid AND p."deletedAt" IS NULL
      GROUP BY p.id
    `;

    const totalSold = sold30.reduce((s, r) => s + r.sold, 0);
    const avgStock = sold30.reduce((s, r) => s + r.quantity, 0) || 1;

    const movers = [...sold30].sort((a, b) => b.sold - a.sold);
    const fastMoving = movers.filter((m) => m.sold > 0).slice(0, 5);
    const slowMoving = movers.filter((m) => m.quantity > 0).slice(-5).reverse();

    // Dead stock: in stock, zero SALE movements in 90 days
    const deadStock = await prisma.$queryRaw<{ id: string; name: string; quantity: number; value: number }[]>`
      SELECT p.id, p.name, p.quantity, (p.quantity * p."buyingPrice")::float AS value
      FROM products p
      WHERE p."businessId" = ${ctx.businessId}::uuid AND p."deletedAt" IS NULL AND p.quantity > 0
        AND NOT EXISTS (
          SELECT 1 FROM inventory_movements m
          WHERE m."productId" = p.id AND m.type = 'SALE'
            AND m."createdAt" >= now() - interval '90 days'
        )
      ORDER BY value DESC LIMIT 5
    `;

    return {
      /** Units sold / average units held, 30-day window (annualize x12 if needed) */
      turnover: Number((totalSold / avgStock).toFixed(2)),
      unitsSold30d: totalSold,
      fastMoving,
      slowMoving,
      deadStock,
    };
  },

  // ---------------------------------------------------------------
  // EXPORT DATA (route handler formats it as CSV/XLSX)
  // ---------------------------------------------------------------
  async getExportRows(ctx: TenantContext, type: "stock" | "movements") {
    if (type === "stock") {
      const products = await prisma.product.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        include: { category: { select: { name: true } }, supplier: { select: { name: true } } },
        orderBy: { name: "asc" },
      });
      return products.map((p) => ({
        name: p.name, sku: p.sku ?? "", barcode: p.barcode ?? "",
        category: p.category?.name ?? "", supplier: p.supplier?.name ?? "",
        quantity: p.quantity, minimumStock: p.minimumStock,
        buyingPrice: Number(p.buyingPrice), sellingPrice: Number(p.sellingPrice),
        stockValue: Number(p.buyingPrice) * p.quantity, status: p.status,
      }));
    }

    const movements = await prisma.inventoryMovement.findMany({
      where: { businessId: ctx.businessId },
      include: {
        product: { select: { name: true, sku: true } },
        user: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    return movements.map((m) => ({
      date: m.createdAt.toISOString(), product: m.product.name, sku: m.product.sku ?? "",
      type: m.type, change: m.quantity, before: m.quantityBefore, after: m.quantityAfter,
      reason: m.reason ?? "", user: m.user?.fullName ?? m.user?.email ?? "system",
    }));
  },

  async getSalesVelocity(
    ctx: TenantContext,
    days: number
  ) {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const rows = await prisma.$queryRaw<
      {
        id: string;
        name: string;
        quantity: number;
        minimumStock: number;
        soldUnits: number;
      }[]
    >`
      SELECT
        p.id,
        p.name,
        p.quantity,
        p."minimumStock",
        COALESCE(SUM(si.quantity - si."returnedQuantity"),0)::int AS "soldUnits"
      FROM products p
      LEFT JOIN sale_items si
        ON si."productId" = p.id
      LEFT JOIN sales s
        ON s.id = si."saleId"
        AND s."businessId" = ${ctx.businessId}::uuid
        AND s."createdAt" >= ${from}
        AND s.status IN ('COMPLETED','PARTIALLY_RETURNED')
      WHERE p."businessId" = ${ctx.businessId}::uuid
        AND p."deletedAt" IS NULL
      GROUP BY
        p.id,
        p.name,
        p.quantity,
        p."minimumStock"
      ORDER BY "soldUnits" DESC;
    `;

    return rows;
  },
};

function endOfDay(d: Date) {
  const e = new Date(d); e.setHours(23, 59, 59, 999); return e;
}
