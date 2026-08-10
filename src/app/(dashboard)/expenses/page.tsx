import { Plus } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { expenseFilterSchema } from "@/lib/validation/expense";
import { expenseService } from "@/services/expense-service";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-primitives";
import { Pagination } from "@/components/shared/interactive";
import { ExpensesTable, ExpensesToolbar } from "@/components/expenses/expenses-table";
import { ExpenseDrawerTrigger } from "@/components/expenses/expense-drawer";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireBusiness();
  const filter = expenseFilterSchema.parse(await searchParams);

  // Lazy recurring materialization: any visit to the expenses page
  // brings due recurring instances into existence (idempotent).
  await expenseService.materializeDue(ctx);

  const { items, total, page, totalPages, sumAmount, sumTax } = await expenseService.list(ctx, filter);
  const canManage = hasPermission(ctx.role, "expenses:manage");
  const currency = ctx.business.currency;

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`${total} ${filter.recurring ? "recurring template" : "expense"}${total === 1 ? "" : "s"} · ${formatMoney(sumAmount, currency)}${sumTax > 0 ? ` (+${formatMoney(sumTax, currency)} tax)` : ""}`}
        actions={canManage && !filter.deleted && (
          <ExpenseDrawerTrigger label={<><Plus className="size-4" aria-hidden /> Add expense</>} />
        )}
      />
      <ExpensesToolbar />
      <ExpensesTable
        expenses={items.map((e) => ({
          id: e.id,
          title: e.title,
          category: e.category,
          vendor: e.supplier?.name ?? null,
          amount: Number(e.amount),
          taxAmount: Number(e.taxAmount),
          date: e.date.toISOString(),
          paymentMethod: e.paymentMethod,
          isRecurring: e.isRecurring,
          recurrenceInterval: e.recurrenceInterval,
          attachments: (e.attachments as { url: string; name: string }[]) ?? [],
          notes: e.notes,
        }))}
        currency={currency}
        canManage={canManage}
        trashView={filter.deleted}
        businessId={ctx.businessId}
      />
      <Pagination page={page} totalPages={totalPages} />
    </>
  );
}
