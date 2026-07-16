import Link from "next/link";
import {
  Banknote, CalendarRange, TrendingUp, Receipt, Boxes, ArrowRight, PackageSearch,
} from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { reportService } from "@/services/report-service";
import { PageHeader, SectionHeader, StatCard } from "@/components/shared/page-primitives";
import { LazyRevenueChart, LazyWeeklySalesChart } from "@/components/charts/lazy";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

const pct = (d: number | null) =>
  d === null ? undefined : { value: `${Math.abs(d)}%`, positive: d >= 0 };

/**
 * Dashboard home — Server Component. Real aggregations via
 * reportService.getHomeDashboard; the page stays pure markup.
 */
export default async function DashboardPage() {
  const ctx = await requireBusiness();
  const currency = ctx.business.currency;
  const firstName = (ctx.user.fullName ?? ctx.user.email).split(" ")[0];
  const { stats, monthlySeries, weeklySeries, recentSales, lowStock } =
    await reportService.getHomeDashboard(ctx);

  return (
    <>
      <PageHeader
        title={`Good day, ${firstName}`}
        description={`Here's how ${ctx.business.name} is doing.`}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Today's sales" value={formatMoney(stats.todaySales, currency)}
          delta={pct(stats.todayDelta)} hint="vs yesterday" icon={Banknote} />
        <StatCard label="Monthly sales" value={formatMoney(stats.monthSales, currency)}
          delta={pct(stats.monthDelta)} hint="vs last month" icon={CalendarRange} />
        <StatCard label="Profit" value={formatMoney(stats.profit, currency)}
          delta={pct(stats.profitDelta)} hint="this month" icon={TrendingUp} />
        <StatCard label="Expenses" value={formatMoney(stats.expenses, currency)}
          delta={stats.expensesDelta === null ? undefined : { value: `${Math.abs(stats.expensesDelta)}%`, positive: stats.expensesDelta <= 0 }}
          hint="vs last month" icon={Receipt} />
        <StatCard label="Inventory value" value={formatMoney(stats.inventoryValue, currency)}
          hint="at cost price" icon={Boxes} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="shadow-soft xl:col-span-3">
          <CardContent className="p-5">
            <SectionHeader title="Revenue & profit" description="Last 7 months" />
            <LazyRevenueChart data={monthlySeries} />
          </CardContent>
        </Card>
        <Card className="shadow-soft xl:col-span-2">
          <CardContent className="p-5">
            <SectionHeader title="Sales this week" description="Completed sales per day" />
            <LazyWeeklySalesChart data={weeklySeries} />
          </CardContent>
        </Card>
      </div>

      {/* Recent sales + low stock */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="shadow-soft xl:col-span-3">
          <CardContent className="p-5">
            <SectionHeader
              title="Recent sales"
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/sales">View all <ArrowRight className="size-3.5" aria-hidden /></Link>
                </Button>
              }
            />
            {recentSales.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <ul className="divide-y">
                {recentSales.map((sale) => (
                  <li key={sale.id} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{sale.customer}</p>
                      <p className="text-xs text-muted-foreground">{sale.number} · {sale.items} items · {timeAgo(sale.createdAt)}</p>
                    </div>
                    <Badge variant={sale.paymentStatus === "PAID" ? "secondary" : "outline"}
                      className={sale.paymentStatus === "PAID" ? "text-success" : sale.paymentStatus === "PARTIAL" ? "text-warning" : "text-muted-foreground"}>
                      {sale.paymentStatus === "PAID" ? "Paid" : sale.paymentStatus === "PARTIAL" ? "Partial" : "Unpaid"}
                    </Badge>
                    <p className="tabular w-24 text-right text-sm font-semibold">
                      {formatMoney(sale.total, currency)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-soft xl:col-span-2">
          <CardContent className="p-5">
            <SectionHeader
              title="Low stock"
              description="Below minimum — reorder soon"
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/inventory"><PackageSearch className="size-3.5" aria-hidden /> Inventory</Link>
                </Button>
              }
            />
            {lowStock.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing low — you&apos;re well stocked.</p>
            ) : (
              <ul className="divide-y">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku}</p>
                    </div>
                    <Badge variant="outline" className="border-warning/40 text-warning">
                      {p.quantity} / {p.minimum}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
