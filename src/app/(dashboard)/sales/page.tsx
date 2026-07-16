import Link from "next/link";
import { Banknote, CreditCard, Plus, RotateCcw, TrendingUp, Percent } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { saleFilterSchema } from "@/lib/validation/sale";
import { saleService } from "@/services/sale-service";
import { formatMoney } from "@/lib/format";
import { PageHeader, SectionHeader, StatCard } from "@/components/shared/page-primitives";
import { Pagination } from "@/components/shared/interactive";
import { SalesTable, SalesToolbar } from "@/components/sales/sales-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Sales" };

export default async function SalesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireBusiness();
  const filter = saleFilterSchema.parse(await searchParams);
  const currency = ctx.business.currency;

  const [{ items, total, page, totalPages }, today] = await Promise.all([
    saleService.list(ctx, filter),
    saleService.getTodayReport(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Sales"
        description={`${total} sale${total === 1 ? "" : "s"}`}
        actions={
          <Button asChild size="lg">
            <Link href="/sales/pos"><Plus className="size-4" aria-hidden /> New sale (POS)</Link>
          </Button>
        }
      />

      {/* Today at a glance */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's sales" value={formatMoney(today.grossSales, currency)}
          hint={`${today.salesCount} transaction${today.salesCount === 1 ? "" : "s"}`} icon={Banknote} />
        <StatCard label="Today's profit" value={formatMoney(today.profit, currency)}
          hint={`${today.margin}% margin`} icon={TrendingUp} />
        <StatCard label="Refunds today" value={formatMoney(today.refunds.amount, currency)}
          hint={`${today.refunds.count} refund${today.refunds.count === 1 ? "" : "s"}`} icon={RotateCcw} />
        <Card className="shadow-soft">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Cash drawer</p>
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <CreditCard className="size-4" aria-hidden />
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {today.drawer.length === 0 && <li className="text-sm text-muted-foreground">No payments yet</li>}
              {today.drawer.map((d) => (
                <li key={d.method} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{d.method.replace("_", " ").toLowerCase()}</span>
                  <span className="tabular font-medium">{formatMoney(d.amount, currency)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {today.bestSellers.length > 0 && (
        <Card className="mb-6 shadow-soft">
          <CardContent className="p-5">
            <SectionHeader title="Best sellers today" />
            <ul className="grid gap-2 sm:grid-cols-5">
              {today.bestSellers.map((b, i) => (
                <li key={b.name} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">#{i + 1}</p>
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="tabular text-xs text-muted-foreground">{b.units} sold · {formatMoney(b.revenue, currency)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <SalesToolbar />
      <SalesTable
        sales={items.map((s) => ({
          id: s.id,
          saleNumber: s.saleNumber,
          invoiceNumber: s.invoice?.invoiceNumber ?? null,
          customer: s.customer?.name ?? "Walk-in",
          cashier: s.user?.fullName ?? s.user?.email ?? "—",
          itemCount: s.items.reduce((n, i) => n + i.quantity, 0),
          total: Number(s.total),
          amountPaid: Number(s.amountPaid),
          status: s.status,
          paymentStatus: s.paymentStatus,
          createdAt: s.createdAt.toISOString(),
        }))}
        currency={currency}
        canManage={hasPermission(ctx.role, "sales:manage")}
      />
      <Pagination page={page} totalPages={totalPages} />
    </>
  );
}
