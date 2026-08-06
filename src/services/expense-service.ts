import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import type { ExpenseInput, ExpenseFilter } from "@/lib/validation/expense";

/**
 * Expense service.
 *
 * RECURRING DESIGN: a recurring expense is a TEMPLATE (isRecurring=true,
 * nextOccurrence set). Templates are excluded from every report query.
 * materializeDue() creates real dated instances (templateId -> template)
 * for every occurrence that has come due, then advances nextOccurrence.
 * It's idempotent by construction (nextOccurrence only moves forward,
 * inside a transaction) and is called lazily when the expenses page
 * loads — no cron needed at this scale; swap in a scheduled job later
 * without touching callers.
 */

function nextDate(d: Date, interval: string): Date {
  const x = new Date(d);
  if (interval === "WEEKLY") x.setDate(x.getDate() + 7);
  else if (interval === "MONTHLY") x.setMonth(x.getMonth() + 1);
  else if (interval === "QUARTERLY") x.setMonth(x.getMonth() + 3);
  else x.setFullYear(x.getFullYear() + 1);
  return x;
}

export const expenseService = {
  async list(ctx: TenantContext, filter: ExpenseFilter) {
    const where: Prisma.ExpenseWhereInput = {
      businessId: ctx.businessId,
      deletedAt: filter.deleted ? { not: null } : null,
      isRecurring: filter.recurring, // templates view vs instances view
      ...(filter.category && { category: filter.category }),
      ...(filter.supplierId && { supplierId: filter.supplierId }),
      ...(filter.q && { title: { contains: filter.q, mode: "insensitive" } }),
      ...((filter.from || filter.to) && {
        date: {
          ...(filter.from && { gte: filter.from }),
          ...(filter.to && { lte: endOfDay(filter.to) }),
        },
      }),
    };

    const [items, total, sum] = await prisma.$transaction([
      prisma.expense.findMany({
        where,
        include: { supplier: { select: { name: true } }, user: { select: { fullName: true } } },
        orderBy: { date: "desc" },
        skip: (filter.page - 1) * filter.perPage,
        take: filter.perPage,
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({ where, _sum: { amount: true, taxAmount: true } }),
    ]);

    return {
      items, total,
      page: filter.page,
      totalPages: Math.max(1, Math.ceil(total / filter.perPage)),
      sumAmount: Number(sum._sum.amount ?? 0),
      sumTax: Number(sum._sum.taxAmount ?? 0),
    };
  },

  async getById(ctx: TenantContext, id: string) {
    const expense = await prisma.expense.findFirst({
      where: { id, businessId: ctx.businessId },
      include: { supplier: { select: { id: true, name: true } } },
    });
    if (!expense) throw new NotFoundError("Expense");
    return expense;
  },

  async create(ctx: TenantContext, input: ExpenseInput) {
    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          businessId: ctx.businessId,
          userId: ctx.user.id,
          title: input.title,
          category: input.category,
          amount: input.amount,
          taxAmount: input.taxAmount,
          date: input.date,
          supplierId: input.supplierId ?? null,
          paymentMethod: input.paymentMethod ?? null,
          notes: input.notes ?? null,
          attachments: input.attachments,
          isRecurring: input.isRecurring,
          recurrenceInterval: input.isRecurring ? input.recurrenceInterval : null,
          // A template's first occurrence is its own date
          nextOccurrence: input.isRecurring ? input.date : null,
        },
      });
      await audit(tx, ctx, "expense.create", "Expense", expense.id, {
        title: input.title, amount: input.amount, recurring: input.isRecurring,
      });
      return expense;
    });
  },

  async update(ctx: TenantContext, id: string, input: ExpenseInput) {
    await this.getById(ctx, id);
    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.update({
        where: { id },
        data: {
          title: input.title, category: input.category,
          amount: input.amount, taxAmount: input.taxAmount, date: input.date,
          supplierId: input.supplierId ?? null,
          paymentMethod: input.paymentMethod ?? null,
          notes: input.notes ?? null,
          attachments: input.attachments,
          isRecurring: input.isRecurring,
          recurrenceInterval: input.isRecurring ? input.recurrenceInterval : null,
        },
      });
      await audit(tx, ctx, "expense.update", "Expense", id, { title: input.title, amount: input.amount });
      return expense;
    });
  },

  async softDelete(ctx: TenantContext, id: string) {
    await this.getById(ctx, id);
    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, ctx, "expense.delete", "Expense", id);
      return expense;
    });
  },

  async restore(ctx: TenantContext, id: string) {
    const expense = await prisma.expense.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: { not: null } },
    });
    if (!expense) throw new NotFoundError("Expense");
    return prisma.$transaction(async (tx) => {
      const restored = await tx.expense.update({ where: { id }, data: { deletedAt: null } });
      await audit(tx, ctx, "expense.restore", "Expense", id);
      return restored;
    });
  },

  /**
   * Materialize due recurring instances. Idempotent: each loop iteration
   * creates the instance AND advances nextOccurrence in one transaction;
   * re-running finds nothing due. Caps at 24 instances per template per
   * call as a safety valve against far-past nextOccurrence values.
   */
  async materializeDue(ctx: TenantContext, now: Date = new Date()) {
    const templates = await prisma.expense.findMany({
      where: {
        businessId: ctx.businessId, deletedAt: null,
        isRecurring: true, nextOccurrence: { lte: now },
      },
    });

    let created = 0;
    for (const template of templates) {
      let cursor = template.nextOccurrence!;
      let guard = 0;
      while (cursor <= now && guard < 24) {
        const occurrence = cursor;
        const next = nextDate(occurrence, template.recurrenceInterval!);
        await prisma.$transaction(async (tx) => {
          await tx.expense.create({
            data: {
              businessId: ctx.businessId,
              userId: template.userId,
              title: template.title,
              category: template.category,
              amount: template.amount,
              taxAmount: template.taxAmount,
              date: occurrence,
              supplierId: template.supplierId,
              paymentMethod: template.paymentMethod,
              notes: template.notes,
              attachments: template.attachments as Prisma.InputJsonValue,
              isRecurring: false,           // instances are normal expenses
              templateId: template.id,
            },
          });
          await tx.expense.update({ where: { id: template.id }, data: { nextOccurrence: next } });
        });
        created++;
        cursor = next;
        guard++;
      }
    }
    return { created };
  },
};

function endOfDay(d: Date) { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; }
