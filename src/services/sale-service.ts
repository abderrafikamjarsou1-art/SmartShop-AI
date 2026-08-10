import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { syncLowStockAlert } from "@/services/stock-alerts";
import { hasPermission } from "@/lib/permissions";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { computeTotals, computeRefund, derivePaymentStatus, round2 } from "@/lib/sale-math";
import type { TenantContext } from "@/lib/tenant";
import type { CreateSaleInput, UpdateDraftInput, ReturnInput, SaleFilter } from "@/lib/validation/sale";

/**
 * Sale service — the most consequential writes in the app.
 *
 * INVARIANTS this service guarantees:
 *  1. A completed sale, its stock decrements, SALE movements, payments,
 *     invoice, customer-balance change, alerts and audit commit in ONE
 *     transaction — all or nothing.
 *  2. unitPrice AND unitCost are snapshotted at sale time; profit reports
 *     never depend on future price edits.
 *  3. Stock can never go below zero unless business.allowOverselling —
 *     enforced with an atomic conditional decrement, not a read-then-write.
 *  4. clientRef makes creation idempotent: a POS retry (flaky network,
 *     future offline sync) can never double-charge or double-decrement.
 */

const saleInclude = {
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
  customer: { select: { id: true, name: true, phone: true, email: true } },
  user: { select: { id: true, fullName: true, email: true } },
  payments: true,
  invoice: true,
} satisfies Prisma.SaleInclude;

export type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

/**
 * Verify a customerId belongs to the tenant before it's ever written onto
 * a sale. This is the ONE entry point — close it here and every
 * downstream customer-balance write (voidSale, processReturn) that reads
 * customerId back off an already tenant-scoped sale row is safe by
 * construction, without needing to re-verify at every call site.
 */
async function verifySaleCustomer(ctx: TenantContext, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: ctx.businessId, deletedAt: null },
  });
  if (!customer) throw new NotFoundError("Customer");
}

export const saleService = {
  // ---------------------------------------------------------------
  // CREATE (draft or completed)
  // ---------------------------------------------------------------
  async create(ctx: TenantContext, input: CreateSaleInput) {
    // IDEMPOTENCY: same clientRef -> return the existing sale, no double-write
    const existing = await prisma.sale.findFirst({
      where: { businessId: ctx.businessId, clientRef: input.clientRef },
      include: saleInclude,
    });
    if (existing) return existing;

    if (input.customerId) await verifySaleCustomer(ctx, input.customerId);

    // Load the cart's products (tenant-scoped) and snapshot prices/costs
    const products = await prisma.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) }, businessId: ctx.businessId, deletedAt: null },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const canOverride = hasPermission(ctx.role, "sales:manage");
    const lines = input.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new NotFoundError("Product");
      // PRICE OVERRIDE is permission-gated; otherwise the DB price wins.
      const unitPrice =
        item.unitPriceOverride !== undefined && canOverride
          ? item.unitPriceOverride
          : Number(product.sellingPrice);
      return {
        product,
        quantity: item.quantity,
        unitPrice,
        unitCost: Number(product.buyingPrice), // SNAPSHOT: cost at sale time
        discountAmount: item.discountAmount,
      };
    });

    const taxRate = input.taxRate ?? Number(ctx.business.taxRate);
    const totals = computeTotals(lines, input.globalDiscount, taxRate);

    // Payments are only relevant when completing
    const paid = input.status === "COMPLETED"
      ? round2(input.payments.reduce((s, p) => s + p.amount, 0))
      : 0;

    if (input.status === "COMPLETED") {
      if (paid > round2(totals.total) && !input.payments.some((p) => p.method === "CASH")) {
        throw new ValidationError("Overpayment is only allowed in cash (change is returned).");
      }
      // Unpaid remainder becomes customer debt -> requires a registered customer
      if (paid < totals.total && !input.customerId) {
        throw new ValidationError("Walk-in sales must be paid in full. Select a customer to allow an outstanding balance.");
      }
    }

    return prisma.$transaction(async (tx) => {
      // STOCK GUARD (completed sales only): atomic conditional decrement.
      // updateMany with quantity >= needed either decrements or matches 0
      // rows — no read-then-write race between concurrent POS terminals.
      if (input.status === "COMPLETED") {
        const allowOverselling = (ctx.business as { allowOverselling?: boolean }).allowOverselling ?? false;
        for (const line of lines) {
          const res = await tx.product.updateMany({
            where: {
              id: line.product.id,
              ...(allowOverselling ? {} : { quantity: { gte: line.quantity } }),
            },
            data: { quantity: { decrement: line.quantity } },
          });
          if (res.count === 0) {
            throw new ConflictError(
              `Not enough stock for “${line.product.name}” (${line.product.quantity} available).`
            );
          }
        }
      }

      // Sequential per-business number (unique constraint is the backstop)
      const last = await tx.sale.findFirst({
        where: { businessId: ctx.businessId },
        orderBy: { saleNumber: "desc" },
        select: { saleNumber: true },
      });
      const saleNumber = (last?.saleNumber ?? 0) + 1;

      const cashChange = input.status === "COMPLETED" ? Math.max(0, round2(paid - totals.total)) : 0;
      const amountPaid = input.status === "COMPLETED" ? round2(paid - cashChange) : 0;

      const sale = await tx.sale.create({
        data: {
          businessId: ctx.businessId,
          customerId: input.customerId ?? null,
          userId: ctx.user.id,
          clientRef: input.clientRef,
          saleNumber,
          status: input.status,
          paymentStatus: input.status === "COMPLETED" ? derivePaymentStatus(amountPaid, totals.total) : "PENDING",
          subtotal: totals.subtotal,
          discountAmount: totals.globalDiscount,
          taxRate,
          taxAmount: totals.taxAmount,
          total: totals.total,
          amountPaid,
          notes: input.notes ?? null,
          items: {
            create: lines.map((l, i) => ({
              productId: l.product.id,
              quantity: l.quantity,
              unitPrice: l.unitPrice,   // SNAPSHOT
              unitCost: l.unitCost,     // SNAPSHOT
              discountAmount: l.discountAmount,
              total: totals.lineTotals[i],
            })),
          },
        },
        include: saleInclude,
      });

      if (input.status === "COMPLETED") {
        // SALE movements (negative), feeding inventory analytics + alerts
        for (const line of lines) {
          const before = line.product.quantity;
          await tx.inventoryMovement.create({
            data: {
              businessId: ctx.businessId,
              productId: line.product.id,
              userId: ctx.user.id,
              type: "SALE",
              quantity: -line.quantity,
              quantityBefore: before,
              quantityAfter: before - line.quantity,
              saleId: sale.id,
            },
          });
          await syncLowStockAlert(tx, ctx, { ...line.product, quantity: before - line.quantity });
        }

        // Payment rows (mixed payments supported)
        for (const p of input.payments) {
          const amount = p.method === "CASH" ? round2(p.amount - cashChange) : p.amount; // change comes out of cash
          if (amount <= 0) continue;
          if (p.method === "STORE_CREDIT") {
            if (!input.customerId) throw new ValidationError("Store credit requires a registered customer.");
            // Atomic guard: only deduct if enough credit exists
            const res = await tx.customer.updateMany({
              where: { id: input.customerId, businessId: ctx.businessId, storeCredit: { gte: amount } },
              data: { storeCredit: { decrement: amount } },
            });
            if (res.count === 0) throw new ConflictError("Not enough store credit.");
          }
          await tx.salePayment.create({
            data: { saleId: sale.id, method: p.method, amount, reference: p.reference ?? null },
          });
        }

        // Unpaid remainder -> customer outstanding balance
        const remainder = round2(totals.total - amountPaid);
        if (remainder > 0 && input.customerId) {
          await tx.customer.update({
            where: { id: input.customerId, businessId: ctx.businessId },
            data: { outstandingBalance: { increment: remainder } },
          });
        }

        // Invoice: sequential per business, 1:1 with the sale
        const lastInv = await tx.invoice.findFirst({
          where: { businessId: ctx.businessId },
          orderBy: { invoiceNumber: "desc" },
          select: { invoiceNumber: true },
        });
        await tx.invoice.create({
          data: {
            businessId: ctx.businessId,
            saleId: sale.id,
            invoiceNumber: (lastInv?.invoiceNumber ?? 0) + 1,
          },
        });
      }

      await audit(tx, ctx, input.status === "DRAFT" ? "sale.draft" : "sale.complete", "Sale", sale.id, {
        saleNumber, total: totals.total, items: lines.length, paid: amountPaid,
      });

      // Re-read with the invoice attached
      return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: saleInclude });
    }, { isolationLevel: "Serializable" });
  },

  // ---------------------------------------------------------------
  // DRAFTS: update, complete (suspend/resume), cancel
  // ---------------------------------------------------------------
  async updateDraft(ctx: TenantContext, input: UpdateDraftInput) {
    const draft = await this.getById(ctx, input.id);
    if (draft.status !== "DRAFT") throw new ValidationError("Only drafts can be edited.");
    if (input.customerId) await verifySaleCustomer(ctx, input.customerId);

    // Rebuild = delete lines + recreate via create()'s logic, atomically.
    // Simplest correct approach: cancel-and-replace inside one transaction.
    return prisma.$transaction(async (tx) => {
      await tx.saleItem.deleteMany({ where: { saleId: draft.id } });

      const products = await tx.product.findMany({
        where: { id: { in: input.items.map((i) => i.productId) }, businessId: ctx.businessId, deletedAt: null },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      const canOverride = hasPermission(ctx.role, "sales:manage");

      const lines = input.items.map((item) => {
        const product = byId.get(item.productId);
        if (!product) throw new NotFoundError("Product");
        return {
          quantity: item.quantity,
          unitPrice: item.unitPriceOverride !== undefined && canOverride
            ? item.unitPriceOverride : Number(product.sellingPrice),
          unitCost: Number(product.buyingPrice),
          discountAmount: item.discountAmount,
          productId: product.id,
        };
      });
      const taxRate = input.taxRate ?? Number(ctx.business.taxRate);
      const totals = computeTotals(lines, input.globalDiscount, taxRate);

      const sale = await tx.sale.update({
        where: { id: draft.id },
        data: {
          customerId: input.customerId ?? null,
          subtotal: totals.subtotal,
          discountAmount: totals.globalDiscount,
          taxRate, taxAmount: totals.taxAmount, total: totals.total,
          notes: input.notes ?? null,
          items: {
            create: lines.map((l, i) => ({
              productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice,
              unitCost: l.unitCost, discountAmount: l.discountAmount, total: totals.lineTotals[i],
            })),
          },
        },
        include: saleInclude,
      });
      await audit(tx, ctx, "sale.draft_update", "Sale", sale.id, { total: totals.total });
      return sale;
    });
  },

  async cancelDraft(ctx: TenantContext, id: string) {
    const draft = await this.getById(ctx, id);
    if (draft.status !== "DRAFT") throw new ValidationError("Only drafts can be cancelled.");
    return prisma.$transaction(async (tx) => {
      const sale = await tx.sale.update({ where: { id }, data: { status: "CANCELLED" } });
      await audit(tx, ctx, "sale.cancel_draft", "Sale", id);
      return sale;
    });
  },

  // ---------------------------------------------------------------
  // VOID — full reversal of a completed sale (manager action)
  // ---------------------------------------------------------------
  async voidSale(ctx: TenantContext, id: string, reason: string) {
    const sale = await this.getById(ctx, id);
    if (sale.status !== "COMPLETED" && sale.status !== "PARTIALLY_RETURNED") {
      throw new ValidationError("Only completed sales can be voided.");
    }

    return prisma.$transaction(async (tx) => {
      // Restore every not-yet-returned unit
      for (const item of sale.items) {
        const restore = item.quantity - item.returnedQuantity;
        if (restore <= 0) continue;
        const product = await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: restore } },
        });
        await tx.inventoryMovement.create({
          data: {
            businessId: ctx.businessId, productId: item.productId, userId: ctx.user.id,
            type: "RETURN", quantity: restore,
            quantityBefore: product.quantity - restore, quantityAfter: product.quantity,
            reason: `Void sale #${sale.saleNumber}: ${reason}`, saleId: sale.id,
          },
        });
        await syncLowStockAlert(tx, ctx, product);
      }

      // Reverse money: negative payment rows mirror the originals
      for (const p of sale.payments) {
        if (Number(p.amount) <= 0) continue;
        await tx.salePayment.create({
          data: { saleId: sale.id, method: p.method, amount: -Number(p.amount), reference: `void:${reason}` },
        });
        if (p.method === "STORE_CREDIT" && sale.customerId) {
          await tx.customer.update({
            where: { id: sale.customerId, businessId: ctx.businessId },
            data: { storeCredit: { increment: Number(p.amount) } },
          });
        }
      }
      // Clear any outstanding balance this sale created
      const remainder = round2(Number(sale.total) - Number(sale.amountPaid));
      if (remainder > 0 && sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId, businessId: ctx.businessId },
          data: { outstandingBalance: { decrement: remainder } },
        });
      }

      const voided = await tx.sale.update({
        where: { id },
        data: { status: "VOIDED", paymentStatus: "REFUNDED", voidedAt: new Date() },
        include: saleInclude,
      });
      await audit(tx, ctx, "sale.void", "Sale", id, { reason, total: sale.total.toString() });
      return voided;
    });
  },

  // ---------------------------------------------------------------
  // RETURNS — partial or full
  // ---------------------------------------------------------------
  async processReturn(ctx: TenantContext, input: ReturnInput) {
    const sale = await this.getById(ctx, input.saleId);
    if (!["COMPLETED", "PARTIALLY_RETURNED"].includes(sale.status)) {
      throw new ValidationError("This sale can't accept returns.");
    }
    if (input.refundMethod === "STORE_CREDIT" && !sale.customerId) {
      throw new ValidationError("Store credit refunds require a registered customer.");
    }

    const byId = new Map(sale.items.map((i) => [i.id, i]));

    return prisma.$transaction(async (tx) => {
      let refundTotal = 0;
      let returnedUnits = 0;

      for (const r of input.items) {
        const item = byId.get(r.saleItemId);
        if (!item) throw new NotFoundError("Sale item");
        const returnable = item.quantity - item.returnedQuantity;
        if (r.quantity > returnable) {
          throw new ValidationError(`Only ${returnable} unit(s) of “${item.product.name}” can be returned.`);
        }

        // Refund at the EFFECTIVE rate the customer paid (see sale-math)
        refundTotal += computeRefund(
          Number(item.total), item.quantity, r.quantity,
          Number(sale.subtotal), Number(sale.total)
        );
        returnedUnits += r.quantity;

        await tx.saleItem.update({
          where: { id: item.id },
          data: { returnedQuantity: { increment: r.quantity } },
        });
        const product = await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: r.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            businessId: ctx.businessId, productId: item.productId, userId: ctx.user.id,
            type: "RETURN", quantity: r.quantity,
            quantityBefore: product.quantity - r.quantity, quantityAfter: product.quantity,
            reason: input.reason, saleId: sale.id,
          },
        });
        await syncLowStockAlert(tx, ctx, product);
      }

      // Never refund more than what was actually paid and not yet refunded
      const alreadyRefunded = sale.payments
        .filter((p) => Number(p.amount) < 0)
        .reduce((s, p) => s + -Number(p.amount), 0);
      refundTotal = round2(Math.min(refundTotal, Number(sale.amountPaid) - alreadyRefunded));

      if (refundTotal > 0) {
        await tx.salePayment.create({
          data: { saleId: sale.id, method: input.refundMethod, amount: -refundTotal, reference: input.reason },
        });
        if (input.refundMethod === "STORE_CREDIT" && sale.customerId) {
          await tx.customer.update({
            where: { id: sale.customerId, businessId: ctx.businessId },
            data: { storeCredit: { increment: refundTotal } },
          });
        }
      }

      // New status: RETURNED only when every unit of every line came back
      const items = await tx.saleItem.findMany({ where: { saleId: sale.id } });
      const fullyReturned = items.every((i) => i.returnedQuantity >= i.quantity);
      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: fullyReturned ? "RETURNED" : "PARTIALLY_RETURNED",
          paymentStatus: fullyReturned ? "REFUNDED" : sale.paymentStatus,
        },
        include: saleInclude,
      });

      await audit(tx, ctx, "sale.return", "Sale", sale.id, {
        units: returnedUnits, refund: refundTotal, method: input.refundMethod, reason: input.reason,
      });
      return { sale: updated, refund: refundTotal };
    });
  },

  // ---------------------------------------------------------------
  // READS
  // ---------------------------------------------------------------
  async getById(ctx: TenantContext, id: string): Promise<SaleWithRelations> {
    const sale = await prisma.sale.findFirst({
      where: { id, businessId: ctx.businessId },
      include: saleInclude,
    });
    if (!sale) throw new NotFoundError("Sale");
    return sale;
  },

  async list(ctx: TenantContext, filter: SaleFilter) {
    const where: Prisma.SaleWhereInput = {
      businessId: ctx.businessId,
      ...(filter.status && { status: filter.status }),
      ...(filter.paymentStatus && { paymentStatus: filter.paymentStatus }),
      ...(filter.customerId && { customerId: filter.customerId }),
      ...((filter.from || filter.to) && {
        createdAt: {
          ...(filter.from && { gte: filter.from }),
          ...(filter.to && { lte: endOfDay(filter.to) }),
        },
      }),
      ...(filter.q && {
        OR: [
          ...(Number.isInteger(Number(filter.q)) ? [{ saleNumber: Number(filter.q) }] : []),
          { customer: { name: { contains: filter.q, mode: "insensitive" as const } } },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.sale.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          user: { select: { fullName: true, email: true } },
          items: { select: { quantity: true, returnedQuantity: true } },
          invoice: { select: { invoiceNumber: true } },
        },
        orderBy: { createdAt: filter.sortDir },
        skip: (filter.page - 1) * filter.perPage,
        take: filter.perPage,
      }),
      prisma.sale.count({ where }),
    ]);
    return { items, total, page: filter.page, totalPages: Math.max(1, Math.ceil(total / filter.perPage)) };
  },

  /** POS customer lookup (name or phone). */
  async searchCustomers(ctx: TenantContext, q: string) {
    return prisma.customer.findMany({
      where: {
        businessId: ctx.businessId, deletedAt: null,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      select: { id: true, name: true, storeCredit: true, outstandingBalance: true },
      take: 8, orderBy: { name: "asc" },
    });
  },

  /** POS product search — lightweight, exact-barcode first, then name/SKU. */
  async searchForPos(ctx: TenantContext, q: string) {
    const exactBarcode = await prisma.product.findFirst({
      where: { businessId: ctx.businessId, deletedAt: null, status: "ACTIVE", barcode: q },
      select: posProductSelect,
    });
    if (exactBarcode) return { exact: true as const, products: [exactBarcode] };

    const products = await prisma.product.findMany({
      where: {
        businessId: ctx.businessId, deletedAt: null, status: "ACTIVE",
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: { startsWith: q } },
        ],
      },
      select: posProductSelect,
      take: 12,
      orderBy: { name: "asc" },
    });
    return { exact: false as const, products };
  },

  // ---------------------------------------------------------------
  // REPORTS — today / cash drawer / best sellers / margins / refunds
  // ---------------------------------------------------------------
  async getTodayReport(ctx: TenantContext) {
    const start = new Date(); start.setHours(0, 0, 0, 0);

    const [salesAgg, profitRow, drawer, best, refunds] = await Promise.all([
      prisma.sale.aggregate({
        where: { businessId: ctx.businessId, createdAt: { gte: start }, status: { in: ["COMPLETED", "PARTIALLY_RETURNED"] } },
        _count: true, _sum: { total: true },
      }),
      // Profit = net revenue - cost of NET units (sold - returned), from snapshots
      prisma.$queryRaw<[{ revenue: number; cost: number }]>`
        SELECT
          COALESCE(SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total), 0)::float AS revenue,
          COALESCE(SUM((i.quantity - i."returnedQuantity") * i."unitCost"), 0)::float AS cost
        FROM sale_items i
        JOIN sales s ON s.id = i."saleId"
        WHERE s."businessId" = ${ctx.businessId}::uuid
          AND s."createdAt" >= ${start}
          AND s.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED')
      `,
      // Cash drawer: SUM per method — refunds are negative rows, so this nets out
      prisma.$queryRaw<{ method: string; amount: number }[]>`
        SELECT p.method, COALESCE(SUM(p.amount), 0)::float AS amount
        FROM sale_payments p
        JOIN sales s ON s.id = p."saleId"
        WHERE s."businessId" = ${ctx.businessId}::uuid AND p."createdAt" >= ${start}
        GROUP BY p.method
      `,
      prisma.$queryRaw<{ name: string; units: number; revenue: number }[]>`
        SELECT pr.name, SUM(i.quantity - i."returnedQuantity")::int AS units,
               SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total)::float AS revenue
        FROM sale_items i
        JOIN sales s ON s.id = i."saleId"
        JOIN products pr ON pr.id = i."productId"
        WHERE s."businessId" = ${ctx.businessId}::uuid AND s."createdAt" >= ${start}
          AND s.status IN ('COMPLETED','PARTIALLY_RETURNED')
        GROUP BY pr.name ORDER BY units DESC LIMIT 5
      `,
      prisma.$queryRaw<[{ count: bigint; amount: number }]>`
        SELECT COUNT(*) AS count, COALESCE(SUM(-p.amount), 0)::float AS amount
        FROM sale_payments p
        JOIN sales s ON s.id = p."saleId"
        WHERE s."businessId" = ${ctx.businessId}::uuid AND p."createdAt" >= ${start} AND p.amount < 0
      `,
    ]);

    const revenue = profitRow[0].revenue;
    const cost = profitRow[0].cost;
    return {
      salesCount: salesAgg._count,
      grossSales: Number(salesAgg._sum.total ?? 0),
      netRevenue: round2(revenue),
      cost: round2(cost),
      profit: round2(revenue - cost),
      margin: revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : 0,
      drawer,
      bestSellers: best,
      refunds: { count: Number(refunds[0].count), amount: refunds[0].amount },
    };
  },
};

const posProductSelect = {
  id: true, name: true, sku: true, barcode: true,
  sellingPrice: true, quantity: true,
  images: { select: { url: true }, where: { isPrimary: true }, take: 1 },
} satisfies Prisma.ProductSelect;

function endOfDay(d: Date) { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; }
