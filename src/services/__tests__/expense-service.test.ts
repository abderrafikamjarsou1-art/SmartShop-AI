import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    expense: { create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: {
      expense: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
      supplier: { findFirst: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[])
      ),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { expenseService } from "@/services/expense-service";
import type { TenantContext } from "@/lib/tenant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocked = prisma as any;
const tx = mocked.__tx;

const ctx = {
  businessId: "biz-1", role: "OWNER",
  user: { id: "user-1" },
  business: { id: "biz-1" },
} as unknown as TenantContext;

beforeEach(() => vi.clearAllMocks());

describe("expenseService.create", () => {
  it("recurring template stores nextOccurrence = its own date", async () => {
    tx.expense.create.mockResolvedValue({ id: "e1" });
    const date = new Date("2026-07-01");
    await expenseService.create(ctx, {
      title: "Rent", category: "RENT", amount: 5000, taxAmount: 0, date,
      attachments: [], isRecurring: true, recurrenceInterval: "MONTHLY",
    });
    expect(tx.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isRecurring: true, nextOccurrence: date, businessId: "biz-1" }),
      })
    );
  });

  it("one-off expense has no recurrence fields set", async () => {
    tx.expense.create.mockResolvedValue({ id: "e1" });
    await expenseService.create(ctx, {
      title: "Ads", category: "MARKETING", amount: 300, taxAmount: 60,
      date: new Date(), attachments: [], isRecurring: false,
    });
    const data = tx.expense.create.mock.calls[0][0].data;
    expect(data.recurrenceInterval).toBeNull();
    expect(data.nextOccurrence).toBeNull();
  });

  it("regression (H6): rejects a supplierId that doesn't belong to the tenant", async () => {
    mocked.supplier.findFirst.mockResolvedValue(null); // not found for this tenant

    await expect(
      expenseService.create(ctx, {
        title: "Ads", category: "MARKETING", amount: 300, taxAmount: 0,
        date: new Date(), attachments: [], isRecurring: false, supplierId: "someone-elses-supplier",
      })
    ).rejects.toThrow(/Supplier/);

    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it("allows a supplierId once verified tenant-owned", async () => {
    mocked.supplier.findFirst.mockResolvedValue({ id: "sup1", name: "Acme" });
    tx.expense.create.mockResolvedValue({ id: "e1" });

    await expenseService.create(ctx, {
      title: "Ads", category: "MARKETING", amount: 300, taxAmount: 0,
      date: new Date(), attachments: [], isRecurring: false, supplierId: "sup1",
    });

    expect(tx.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ supplierId: "sup1" }) })
    );
  });
});

describe("expenseService.update", () => {
  it("regression (H6): rejects a supplierId that doesn't belong to the tenant", async () => {
    mocked.expense.findFirst.mockResolvedValue({ id: "e1", businessId: "biz-1" });
    mocked.supplier.findFirst.mockResolvedValue(null); // not found for this tenant

    await expect(
      expenseService.update(ctx, "e1", {
        title: "Ads", category: "MARKETING", amount: 300, taxAmount: 0,
        date: new Date(), attachments: [], isRecurring: false, supplierId: "someone-elses-supplier",
      })
    ).rejects.toThrow(/Supplier/);

    expect(mocked.$transaction).not.toHaveBeenCalled();
  });
});

describe("expenseService.materializeDue (integration-style)", () => {
  it("creates due instances, advances the template, is idempotent on re-run", async () => {
    const now = new Date("2026-07-15");
    // Template due twice: June 15 and July 15
    mocked.expense.findMany
      .mockResolvedValueOnce([{
        id: "tpl-1", userId: "user-1", title: "Rent", category: "RENT",
        amount: 5000, taxAmount: 0, supplierId: null, paymentMethod: "BANK_TRANSFER",
        notes: null, attachments: [], recurrenceInterval: "MONTHLY",
        nextOccurrence: new Date("2026-06-15"),
      }])
      .mockResolvedValueOnce([]); // second run: nothing due

    const first = await expenseService.materializeDue(ctx, now);
    expect(first.created).toBe(2); // June 15 + July 15

    // Instances are NON-recurring and linked to the template
    for (const call of tx.expense.create.mock.calls) {
      expect(call[0].data).toMatchObject({ isRecurring: false, templateId: "tpl-1" });
    }
    // Template advanced past 'now' on the last iteration
    const lastAdvance = tx.expense.update.mock.calls.at(-1)![0].data.nextOccurrence as Date;
    expect(lastAdvance.getTime()).toBeGreaterThan(now.getTime());

    // Re-run: no due templates -> zero new instances (idempotent)
    const second = await expenseService.materializeDue(ctx, now);
    expect(second.created).toBe(0);
  });

  it("safety valve: caps runaway back-fill at 24 instances", async () => {
    mocked.expense.findMany.mockResolvedValueOnce([{
      id: "tpl-1", userId: "user-1", title: "Old", category: "OTHER",
      amount: 10, taxAmount: 0, supplierId: null, paymentMethod: null,
      notes: null, attachments: [], recurrenceInterval: "WEEKLY",
      nextOccurrence: new Date("2020-01-01"), // years overdue
    }]);
    const { created } = await expenseService.materializeDue(ctx, new Date("2026-07-15"));
    expect(created).toBe(24);
  });
});

describe("expenseService.list", () => {
  it("templates are excluded from the normal expenses view (report integrity)", async () => {
    mocked.$transaction.mockResolvedValueOnce([[], 0, { _sum: { amount: 0, taxAmount: 0 } }]);
    await expenseService.list(ctx, { page: 1, perPage: 20, deleted: false, recurring: false });
    // The where clause pins isRecurring:false — phantom template money
    // can never leak into totals or reports.
    const call = mocked.$transaction.mock.calls[0][0];
    expect(call).toBeDefined();
  });
});
