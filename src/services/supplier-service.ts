import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { round2 } from "@/lib/sale-math";
import { parseContactCsv } from "@/services/customer-service";
import type { TenantContext } from "@/lib/tenant";
import type { CreateSupplierInput, SupplierFilter } from "@/lib/validation/contact";

/** Supplier service — mirrors customerService; analytics read the PO history. */

export const supplierService = {
  async list(ctx: TenantContext, filter: SupplierFilter) {
    const where: Prisma.SupplierWhereInput = {
      businessId: ctx.businessId,
      deletedAt: filter.deleted ? { not: null } : null,
      ...(filter.q && {
        OR: [
          { name: { contains: filter.q, mode: "insensitive" } },
          { contactPerson: { contains: filter.q, mode: "insensitive" } },
          { phone: { contains: filter.q } },
          { email: { contains: filter.q, mode: "insensitive" } },
        ],
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.supplier.findMany({
        where,
        include: { _count: { select: { products: true, purchases: true } } },
        orderBy: { [filter.sortBy]: filter.sortDir },
        skip: (filter.page - 1) * filter.perPage,
        take: filter.perPage,
      }),
      prisma.supplier.count({ where }),
    ]);
    return { items, total, page: filter.page, totalPages: Math.max(1, Math.ceil(total / filter.perPage)) };
  },

  async getById(ctx: TenantContext, id: string) {
    const supplier = await prisma.supplier.findFirst({ where: { id, businessId: ctx.businessId } });
    if (!supplier) throw new NotFoundError("Supplier");
    return supplier;
  },

  async create(ctx: TenantContext, input: CreateSupplierInput) {
    return prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: { businessId: ctx.businessId, ...input, email: input.email ?? null },
      });
      await audit(tx, ctx, "supplier.create", "Supplier", supplier.id, { name: supplier.name });
      return supplier;
    });
  },

  async update(ctx: TenantContext, input: CreateSupplierInput & { id: string }) {
    await this.getById(ctx, input.id);
    return prisma.$transaction(async (tx) => {
      const { id, ...data } = input;
      const supplier = await tx.supplier.update({ where: { id }, data: { ...data, email: data.email ?? null } });
      await audit(tx, ctx, "supplier.update", "Supplier", id);
      return supplier;
    });
  },

  async softDelete(ctx: TenantContext, id: string) {
    await this.getById(ctx, id);
    const openPo = await prisma.purchase.count({
      where: { businessId: ctx.businessId, supplierId: id, status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } },
    });
    if (openPo > 0) throw new ValidationError("This supplier has open purchase orders — receive or cancel them first.");
    return prisma.$transaction(async (tx) => {
      await tx.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, ctx, "supplier.delete", "Supplier", id);
      return { id };
    });
  },

  async restore(ctx: TenantContext, id: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: { not: null } },
    });
    if (!supplier) throw new NotFoundError("Supplier");
    return prisma.$transaction(async (tx) => {
      await tx.supplier.update({ where: { id }, data: { deletedAt: null } });
      await audit(tx, ctx, "supplier.restore", "Supplier", id);
      return { id };
    });
  },

  // ---------------------------------------------------------------
  // PROFILE — spend, lead time, products supplied, pricing history
  // ---------------------------------------------------------------
  async getProfile(ctx: TenantContext, id: string) {
    const supplier = await this.getById(ctx, id);

    const [stats, leadTime, products, openPos, recentPos] = await Promise.all([
      prisma.purchase.aggregate({
        where: { businessId: ctx.businessId, supplierId: id, status: { in: ["PARTIALLY_RECEIVED", "RECEIVED"] } },
        _sum: { total: true }, _count: true, _max: { createdAt: true },
      }),
      // Lead time = avg(receivedAt - sentAt) over fully received POs
      prisma.$queryRaw<[{ days: number | null }]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("receivedAt" - "sentAt")) / 86400)::float AS days
        FROM purchases
        WHERE "businessId" = ${ctx.businessId}::uuid AND "supplierId" = ${id}::uuid
          AND "receivedAt" IS NOT NULL AND "sentAt" IS NOT NULL
      `,
      // Products supplied: catalog link + actually-purchased, with avg cost
      prisma.$queryRaw<{ id: string; name: string; sku: string | null; avgCost: number; lastCost: number; units: number }[]>`
        SELECT p.id, p.name, p.sku,
               AVG(pi."unitCost")::float AS "avgCost",
               (ARRAY_AGG(pi."unitCost" ORDER BY pu."createdAt" DESC))[1]::float AS "lastCost",
               SUM(pi."receivedQuantity")::int AS units
        FROM purchase_items pi
        JOIN purchases pu ON pu.id = pi."purchaseId"
        JOIN products p ON p.id = pi."productId"
        WHERE pu."businessId" = ${ctx.businessId}::uuid AND pu."supplierId" = ${id}::uuid
        GROUP BY p.id ORDER BY units DESC LIMIT 15
      `,
      prisma.purchase.findMany({
        where: { businessId: ctx.businessId, supplierId: id, status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } },
        select: {
          id: true, purchaseNumber: true, status: true, total: true, expectedAt: true,
          items: { select: { quantity: true, receivedQuantity: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.purchase.findMany({
        where: { businessId: ctx.businessId, supplierId: id },
        select: { id: true, purchaseNumber: true, status: true, total: true, createdAt: true },
        orderBy: { createdAt: "desc" }, take: 10,
      }),
    ]);

    return {
      supplier,
      kpis: {
        totalSpend: round2(Number(stats._sum.total ?? 0)),
        orderCount: stats._count,
        avgLeadTimeDays: leadTime[0].days !== null ? round2(leadTime[0].days) : null,
        lastPurchase: stats._max.createdAt,
        openOrders: openPos.length,
      },
      products,
      openPos,
      recentPos,
    };
  },

  /** Timeline: PO lifecycle events + returns to this supplier. */
  async getTimeline(ctx: TenantContext, id: string, take = 30) {
    await this.getById(ctx, id);

    const [pos, receipts, returns] = await Promise.all([
      prisma.purchase.findMany({
        where: { businessId: ctx.businessId, supplierId: id },
        select: { purchaseNumber: true, total: true, createdAt: true, sentAt: true },
        orderBy: { createdAt: "desc" }, take,
      }),
      prisma.purchaseReceipt.findMany({
        where: { businessId: ctx.businessId, purchase: { supplierId: id } },
        select: { createdAt: true, lines: true, purchase: { select: { purchaseNumber: true } } },
        orderBy: { createdAt: "desc" }, take,
      }),
      prisma.inventoryMovement.findMany({
        where: {
          businessId: ctx.businessId, type: "RETURN", quantity: { lt: 0 },
          purchase: { supplierId: id },
        },
        select: { createdAt: true, quantity: true, purchase: { select: { purchaseNumber: true } } },
        orderBy: { createdAt: "desc" }, take,
      }),
    ]);

    type Event = { type: "purchase" | "receipt" | "return"; at: Date; label: string; amount: number };
    const events: Event[] = [
      ...pos.map((p): Event => ({
        type: "purchase", at: p.createdAt,
        label: `PO-${String(p.purchaseNumber).padStart(5, "0")} created`, amount: Number(p.total),
      })),
      ...receipts.map((r): Event => ({
        type: "receipt", at: r.createdAt,
        label: `Received ${(r.lines as { quantity: number }[]).reduce((s, l) => s + l.quantity, 0)} unit(s) — PO-${String(r.purchase.purchaseNumber).padStart(5, "0")}`,
        amount: 0,
      })),
      ...returns.map((r): Event => ({
        type: "return", at: r.createdAt,
        label: `Returned ${-r.quantity} unit(s) — PO-${String(r.purchase?.purchaseNumber ?? 0).padStart(5, "0")}`,
        amount: 0,
      })),
    ];
    return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
  },

  // ---------------------------------------------------------------
  // CSV IMPORT / EXPORT
  // ---------------------------------------------------------------
  async previewImport(ctx: TenantContext, csvText: string) {
    const rows = parseContactCsv(csvText);
    const names = rows.filter((r) => r.data).map((r) => r.data!.name.toLowerCase());
    const existing = await prisma.supplier.findMany({
      where: { businessId: ctx.businessId, deletedAt: null },
      select: { name: true, phone: true, email: true },
    });
    const dupNames = new Set(existing.map((e) => e.name.toLowerCase()).filter((n) => names.includes(n)));
    const dupPhones = new Set(existing.map((e) => e.phone).filter(Boolean));
    const dupEmails = new Set(existing.map((e) => e.email).filter(Boolean));

    return rows.map((r) => {
      if (r.error) return { row: r.row, name: r.raw["name"] ?? "?", status: "error" as const, error: r.error };
      const d = r.data!;
      if (dupNames.has(d.name.toLowerCase()) || (d.phone && dupPhones.has(d.phone)) || (d.email && dupEmails.has(d.email))) {
        return { row: r.row, name: d.name, status: "duplicate" as const, error: "Matches an existing supplier." };
      }
      return { row: r.row, name: d.name, status: "ok" as const };
    });
  },

  async commitImport(ctx: TenantContext, csvText: string) {
    const preview = await this.previewImport(ctx, csvText);
    const okRows = new Set(preview.filter((p) => p.status === "ok").map((p) => p.row));
    const rows = parseContactCsv(csvText).filter((r) => r.data && okRows.has(r.row));
    if (rows.length === 0) throw new ValidationError("No importable rows (all invalid or duplicates).");

    await prisma.$transaction(async (tx) => {
      await tx.supplier.createMany({
        data: rows.map((r) => ({
          businessId: ctx.businessId,
          name: r.data!.name, phone: r.data!.phone ?? null, email: r.data!.email ?? null,
          address: r.data!.address ?? null, notes: r.data!.notes ?? null,
        })),
      });
      await audit(tx, ctx, "supplier.import", "Supplier", ctx.businessId, {
        imported: rows.length, skipped: preview.length - rows.length,
      });
    });
    return { imported: rows.length, skipped: preview.length - rows.length };
  },

  async getExportRows(ctx: TenantContext) {
    const suppliers = await prisma.supplier.findMany({
      where: { businessId: ctx.businessId, deletedAt: null },
      include: { _count: { select: { products: true, purchases: true } } },
      orderBy: { name: "asc" },
    });
    return suppliers.map((s) => ({
      name: s.name, contactPerson: s.contactPerson ?? "", phone: s.phone ?? "",
      email: s.email ?? "", address: s.address ?? "",
      products: s._count.products, purchaseOrders: s._count.purchases,
      since: s.createdAt.toISOString().slice(0, 10),
    }));
  },
};
