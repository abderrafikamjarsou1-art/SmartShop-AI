"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/tenant";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { zParse, zUuid } from "@/lib/validation";
import { expenseSchema, updateExpenseSchema } from "@/lib/validation/expense";
import { expenseService } from "@/services/expense-service";

/** Expense actions — permission: expenses:manage. */

export async function createExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("expenses.create", async () => {
    const ctx = await requireRole("expenses:manage");
    const data = zParse(expenseSchema, input);
    const expense = await expenseService.create(ctx, data);
    revalidatePath("/expenses"); revalidatePath("/reports");
    return { id: expense.id };
  });
}

export async function updateExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("expenses.update", async () => {
    const ctx = await requireRole("expenses:manage");
    const data = zParse(updateExpenseSchema, input);
    const { id, ...rest } = data;
    await expenseService.update(ctx, id, rest);
    revalidatePath("/expenses"); revalidatePath("/reports");
    return { id };
  });
}

export async function deleteExpense(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("expenses.delete", async () => {
    const ctx = await requireRole("expenses:manage");
    await expenseService.softDelete(ctx, zParse(zUuid, id));
    revalidatePath("/expenses"); revalidatePath("/reports");
    return { id };
  });
}

export async function restoreExpense(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("expenses.restore", async () => {
    const ctx = await requireRole("expenses:manage");
    await expenseService.restore(ctx, zParse(zUuid, id));
    revalidatePath("/expenses"); revalidatePath("/reports");
    return { id };
  });
}
