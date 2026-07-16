import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { round2, derivePaymentStatus } from "@/lib/sale-math";
import { csvToObjects } from "@/lib/csv";
import { contactCsvRowSchema } from "@/lib/validation/contact";
import type { TenantContext } from "@/lib/tenant";
import type {
  CreateCustomerInput, CustomerFilter, RecordPaymentInput,
} from "@/lib/validation/contact";

/** Customer service — profile analytics, account payments, timeline. */

export const customerService = {
  // ---------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------
  async list(ctx: TenantContext, filter: CustomerFilter) {
    const where: Prisma.CustomerWhereInput = {
      businessId: ctx.businessId,
      deletedAt: filter.deleted ? { not: null } : null,
      ...(filter.tag && { tags: { has: filter.tag } }),
      ...(filter.balance === "owing" && { outstandingBalance: { gt: 0 } }),
      ...(filter.balance === "credit" && { storeCredit: { gt: 0 } }),
      ...(filter.q && {
        OR: [
          { name: { contains: filter.q, mode: "insensitive" } },
          { phone: { contains: filter.q } },
          { email: { contains: filter.q, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        orderBy: { [filter.sortBy]: filter.sortDir },
        skip: (filter.page - 1) * filter.perPage,
        take: filter.perPage,
      }),
      prisma.customer.count({ where }),
    ]);
    return { items, total, page: filter.page, totalPages: Math.max(1, Math.ceil(total / filter.perPage)) };
  },

  async getById(ctx: TenantContext, id: string) {
    const customer = await prisma.customer.findFirst({ where: { id, businessId: ctx.businessId } });
    if (!customer) throw new NotFoundError("Customer");
    return customer;
  },

  async create(ctx: TenantContext, input: CreateCustomerInput) {
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { businessId: ctx.businessId, ...input, email: input.email ?? null },
      });
      await audit(tx, ctx, "customer.create", "Customer", customer.id, { name: customer.name });
      return customer;
    });
  },

  async update(ctx: TenantContext, input: CreateCustomerInput & { id: string }) {
    await this.getById(ctx, input.id);
    return prisma.$transaction(async (tx) => {
      const { id, ...data } = input;
      const customer = await tx.customer.update({ where: { id }, data: { ...data, email: data.email ?? null } });
      await audit(tx, ctx, "customer.update", "Customer", id);
      return customer;
    });
  },

  async softDelete(ctx: TenantContext, id: string) {
    const customer = await this.getById(ctx, id);
    if (Number(customer.outstandingBalance) > 0) {
      throw new ValidationError("This customer still owes money — settle the balance before deleting.");
    }
    return prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, ctx, "customer.delete", "Customer", id);
      return { id };
    });
  },

  async restore(ctx: TenantContext, id: string) {
    const customer = await prisma.customer.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: { not: null } },
    });
    if (!customer) throw new NotFoundError("Customer");
    return prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: { deletedAt: null } });
      await audit(tx, ctx, "customer.restore", "Customer", id);
      return { id };
    });
  },

  // ---------------------------------------------------------------
  // PROFILE — KPIs computed from sale snapshots
  // ---------------------------------------------------------------
  async getProfile(ctx: TenantContext, id: string) {
    const customer = await this.getById(ctx, id);

    const [stats, favorites, recentSales, payments] = await Promise.all([
      // LTV (net revenue), order count, AOV base, last purchase — one pass
      prisma.$queryRaw<[{ ltv: number; orders: bigint; lastPurchase: Date | null }]>`
        SELECT
          COALESCE(SUM(
            (SELECT COALESCE(SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total), 0)
             FROM sale_items i WHERE i."saleId" = s.id)
          ), 0)::float AS ltv,
          COUNT(*) FILTER (WHERE s.status IN ('COMPLETED','PARTIALLY_RETURNED')) AS orders,
          MAX(s."createdAt") AS "lastPurchase"
        FROM sales s
        WHERE s."businessId" = ${ctx.businessId}::uuid AND s."customerId" = ${id}::uuid
          AND s.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED')
      `,
      prisma.$queryRaw<{ name: string; units: number }[]>`
        SELECT p.name, SUM(i.quantity - i."returnedQuantity")::int AS units
        FROM sale_items i
        JOIN sales s ON s.id = i."saleId"
        JOIN products p ON p.id = i."productId"
        WHERE s."businessId" = ${ctx.businessId}::uuid AND s."customerId" = ${id}::uuid
          AND s.status IN ('COMPLETED','PARTIALLY_RETURNED')
        GROUP BY p.name HAVING SUM(i.quantity - i."returnedQuantity") > 0
        ORDER BY units DESC LIMIT 5
      `,
      prisma.sale.findMany({
        where: { businessId: ctx.businessId, customerId: id },
        select: {
          id: true, saleNumber: true, status: true, paymentStatus: true,
          total: true, amountPaid: true, createdAt: true,
          invoice: { select: { invoiceNumber: true } },
        },
        orderBy: { createdAt: "desc" }, take: 10,
      }),
      prisma.customerPayment.findMany({
        where: { businessId: ctx.businessId, customerId: id },
        orderBy: { createdAt: "desc" }, take: 10,
      }),
    ]);

    const orders = Number(stats[0].orders);
    return {
      customer,
      kpis: {
        ltv: round2(stats[0].ltv),
        orders,
        aov: orders > 0 ? round2(stats[0].ltv / orders) : 0,
        lastPurchase: stats[0].lastPurchase,
        outstandingBalance: Number(customer.outstandingBalance),
        storeCredit: Number(customer.storeCredit),
      },
      favorites,
      recentSales,
      payments,
    };
  },

  // ---------------------------------------------------------------
  // RECORD PAYMENT — FIFO allocation to open sales
  // ---------------------------------------------------------------
  async recordPayment(ctx: TenantContext, input: RecordPaymentInput) {
    const customer = await this.getById(ctx, input.customerId);
    const owed = Number(customer.outstandingBalance);
    if (owed <= 0) throw new ValidationError("This customer has no outstanding balance.");
    if (input.amount > owed) {
      throw new ValidationError(`Amount exceeds the outstanding balance (${owed.toFixed(2)}).`);
    }

    return prisma.$transaction(async (tx) => {
      // STORE_CREDIT payments consume the customer's credit — atomic guard
      if (input.method === "STORE_CREDIT") {
        const res = await tx.customer.updateMany({
          where: { id: customer.id, storeCredit: { gte: input.amount } },
          data: { storeCredit: { decrement: input.amount } },
        });
        if (res.count === 0) throw new ConflictError("Not enough store credit.");
      }

      // FIFO: apply to the oldest sales that still have an unpaid remainder
      const openSales = await tx.sale.findMany({
        where: {
          businessId: ctx.businessId, customerId: customer.id,
          status: { in: ["COMPLETED", "PARTIALLY_RETURNED"] },
          paymentStatus: { in: ["PENDING", "PARTIAL"] },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, saleNumber: true, total: true, amountPaid: true },
      });

      let remaining = input.amount;
      const allocations: { saleId: string; saleNumber: number; amount: number }[] = [];

      for (const sale of openSales) {
        if (remaining <= 0) break;
        const open = round2(Number(sale.total) - Number(sale.amountPaid));
        if (open <= 0) continue;
        const applied = round2(Math.min(open, remaining));

        const newPaid = round2(Number(sale.amountPaid) + applied);
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            amountPaid: newPaid,
            // AUTOMATIC sale status update — same rule as the POS
            paymentStatus: derivePaymentStatus(newPaid, Number(sale.total)),
          },
        });
        // Money lands in SalePayment -> the cash drawer stays the single truth
        await tx.salePayment.create({
          data: { saleId: sale.id, method: input.method, amount: applied, reference: input.reference ?? "account payment" },
        });

        allocations.push({ saleId: sale.id, saleNumber: sale.saleNumber, amount: applied });
        remaining = round2(remaining - applied);
      }

      const payment = await tx.customerPayment.create({
        data: {
          businessId: ctx.businessId,
          customerId: customer.id,
          userId: ctx.user.id,
          method: input.method,
          amount: input.amount,
          allocations,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
        },
      });

      await tx.customer.update({
        where: { id: customer.id },
        data: { outstandingBalance: { decrement: input.amount } },
      });

      await audit(tx, ctx, "customer.payment", "Customer", customer.id, {
        amount: input.amount, method: input.method, allocations,
      });

      return { payment, allocations };
    });
  },

  // ---------------------------------------------------------------
  // TIMELINE — union of events, newest first
  // ---------------------------------------------------------------
  async getTimeline(ctx: TenantContext, id: string, take = 30) {
    await this.getById(ctx, id);

    const [sales, salePayments, accountPayments] = await Promise.all([
      prisma.sale.findMany({
        where: { businessId: ctx.businessId, customerId: id },
        select: { id: true, saleNumber: true, status: true, total: true, createdAt: true, voidedAt: true },
        orderBy: { createdAt: "desc" }, take,
      }),
      // Negative SalePayments on this customer's sales = refunds/returns
      prisma.salePayment.findMany({
        where: { sale: { businessId: ctx.businessId, customerId: id }, amount: { lt: 0 } },
        select: { amount: true, method: true, createdAt: true, sale: { select: { saleNumber: true } } },
        orderBy: { createdAt: "desc" }, take,
      }),
      prisma.customerPayment.findMany({
        where: { businessId: ctx.businessId, customerId: id },
        select: { amount: true, method: true, createdAt: true, allocations: true },
        orderBy: { createdAt: "desc" }, take,
      }),
    ]);

    type Event = { type: "sale" | "return" | "payment" | "void"; at: Date; label: string; amount: number };
    const events: Event[] = [
      ...sales.map((s): Event => ({
        type: s.status === "VOIDED" ? "void" : "sale",
        at: s.createdAt,
        label: `Sale #${s.saleNumber}${s.status === "VOIDED" ? " (voided)" : ""}`,
        amount: Number(s.total),
      })),
      ...salePayments.map((p): Event => ({
        type: "return",
        at: p.createdAt,
        label: `Refund on sale #${p.sale.saleNumber} (${p.method.toLowerCase().replace("_", " ")})`,
        amount: Number(p.amount),
      })),
      ...accountPayments.map((p): Event => ({
        type: "payment",
        at: p.createdAt,
        label: `Account payment (${p.method.toLowerCase().replace("_", " ")})`,
        amount: Number(p.amount),
      })),
    ];
    return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
  },

  // ---------------------------------------------------------------
  // CSV IMPORT — duplicate detection + preview/commit
  // ---------------------------------------------------------------
  async previewImport(ctx: TenantContext, csvText: string) {
    const rows = parseContactCsv(csvText);
    const phones = rows.filter((r) => r.data?.phone).map((r) => r.data!.phone!);
    const emails = rows.filter((r) => r.data?.email).map((r) => r.data!.email!);

    // Duplicate detection: existing phone OR email in this tenant
    const existing = await prisma.customer.findMany({
      where: {
        businessId: ctx.businessId, deletedAt: null,
        OR: [
          ...(phones.length ? [{ phone: { in: phones } }] : []),
          ...(emails.length ? [{ email: { in: emails } }] : []),
        ],
      },
      select: { phone: true, email: true },
    });
    const dupPhones = new Set(existing.map((e) => e.phone).filter(Boolean));
    const dupEmails = new Set(existing.map((e) => e.email).filter(Boolean));

    return rows.map((r) => {
      if (r.error) return { row: r.row, name: r.raw["name"] ?? "?", status: "error" as const, error: r.error };
      const d = r.data!;
      if ((d.phone && dupPhones.has(d.phone)) || (d.email && dupEmails.has(d.email))) {
        return { row: r.row, name: d.name, status: "duplicate" as const, error: "Matches an existing customer (phone/email)." };
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
      await tx.customer.createMany({
        data: rows.map((r) => ({
          businessId: ctx.businessId,
          name: r.data!.name,
          phone: r.data!.phone ?? null,
          email: r.data!.email ?? null,
          address: r.data!.address ?? null,
          notes: r.data!.notes ?? null,
          tags: r.data!.tags ? r.data!.tags.split("|").map((t) => t.trim()).filter(Boolean) : [],
        })),
      });
      await audit(tx, ctx, "customer.import", "Customer", ctx.businessId, {
        imported: rows.length, skipped: preview.length - rows.length,
      });
    });
    return { imported: rows.length, skipped: preview.length - rows.length };
  },

  /** Rows for CSV/XLSX/PDF export. */
  async getExportRows(ctx: TenantContext) {
    const customers = await prisma.customer.findMany({
      where: { businessId: ctx.businessId, deletedAt: null },
      orderBy: { name: "asc" },
    });
    return customers.map((c) => ({
      name: c.name, phone: c.phone ?? "", email: c.email ?? "",
      address: c.address ?? "", tags: c.tags.join("|"),
      outstandingBalance: Number(c.outstandingBalance), storeCredit: Number(c.storeCredit),
      since: c.createdAt.toISOString().slice(0, 10),
    }));
  },
};

/** Shared CSV row parser (also used by supplier-service). */
export function parseContactCsv(csvText: string) {
  const { headers, objects } = csvToObjects(csvText);
  if (!headers.includes("name")) throw new ValidationError("Missing column “name”. Expected header: name,phone,email,address,notes,tags");
  return objects.map((obj, i) => {
    const parsed = contactCsvRowSchema.safeParse({
      name: obj["name"], phone: obj["phone"] || undefined, email: obj["email"] || undefined,
      address: obj["address"] || undefined, notes: obj["notes"] || undefined, tags: obj["tags"] || undefined,
    });
    return parsed.success
      ? { row: i + 1, raw: obj, data: parsed.data, error: undefined }
      : { row: i + 1, raw: obj, data: undefined, error: parsed.error.issues[0].message };
  });
}
