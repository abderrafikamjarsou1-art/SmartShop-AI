import { Banknote, Boxes, Receipt, TrendingUp, Wallet, ArrowLeftRight } from "lucide-react";
import { requireRole } from "@/lib/tenant";
import { reportFilterSchema } from "@/lib/validation/expense";
import { reportService } from "@/services/report-service";
import { inventoryService } from "@/services/inventory-service";
import { formatMoney } from "@/lib/format";
import { PageHeader, SectionHeader, StatCard, EmptyState } from "@/components/shared/page-primitives";
import { PeriodPicker, ReportTabs, ExportMenu } from "@/components/reports/report-controls";
import { LazyTrendChart, LazyPaymentPie, LazyGrowthChart } from "@/components/reports/lazy-charts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Reports" };

/**
 * Reports — one URL-driven page, four dashboards (tabs).
 * The Server Component fetches ONLY the data the active tab needs.
 */
export default async function ReportsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireRole("reports:view");
  const filter = reportFilterSchema.parse(await searchParams);
  const period = reportService.resolve(filter);
  const currency = ctx.business.currency;
  const m = (n: number) => formatMoney(n, currency);

  return (
    <>
      <PageHeader
        title="Reports"
        description={period.label}
        actions={<ExportMenu preset={filter.preset} from={filter.from?.toISOString()} to={filter.to?.toISOString()} />}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <ReportTabs active={filter.tab} />
        <PeriodPicker />
      </div>

      {filter.tab === "executive" && <ExecutiveDashboard ctx={ctx} period={period} m={m} />}
      {filter.tab === "sales" && <SalesDashboard ctx={ctx} period={period} m={m} />}
      {filter.tab === "inventory" && <InventoryDashboard ctx={ctx} m={m} />}
      {filter.tab === "financial" && <FinancialDashboard ctx={ctx} period={period} m={m} />}
    </>
  );
}

type Ctx = Awaited<ReturnType<typeof requireRole>>;
type Period = ReturnType<typeof reportService.resolve>;
type M = (n: number) => string;

// ---------- Executive: the owner's 30-second answer ----------
async function ExecutiveDashboard({ ctx, period, m }: { ctx: Ctx; period: Period; m: M }) {
  const [{ summary, deltas }, trends, topProducts, topCustomers] = await Promise.all([
    reportService.getFinancialSummary(ctx, period),
    reportService.getTrends(ctx, period),
    reportService.getTopProducts(ctx, period, 5),
    reportService.getTopCustomers(ctx, period, 5),
  ]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net revenue" value={m(summary.netRevenue)} icon={Banknote}
          delta={deltas.netRevenue !== null ? { value: `${Math.abs(deltas.netRevenue)}%`, positive: deltas.netRevenue >= 0 } : undefined}
          hint="vs previous period" />
        <StatCard label="Gross profit" value={m(summary.grossProfit)} icon={TrendingUp}
          delta={deltas.grossProfit !== null ? { value: `${Math.abs(deltas.grossProfit)}%`, positive: deltas.grossProfit >= 0 } : undefined}
          hint={`${summary.grossMargin}% margin`} />
        <StatCard label="Net profit" value={m(summary.netProfit)} icon={Wallet}
          delta={deltas.netProfit !== null ? { value: `${Math.abs(deltas.netProfit)}%`, positive: deltas.netProfit >= 0 } : undefined}
          hint={`${summary.netMargin}% margin`} />
        <StatCard label="Expenses" value={m(summary.operatingExpenses)} icon={Receipt}
          delta={deltas.expenses !== null ? { value: `${Math.abs(deltas.expenses)}%`, positive: deltas.expenses <= 0 } : undefined}
          hint="vs previous period" />
      </div>

      <Card className="mt-6 shadow-soft">
        <CardContent className="p-5">
          <SectionHeader title="Revenue, profit & expenses" description={period.label} />
          <LazyTrendChart data={trends} series={["revenue", "profit", "expenses"]} />
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <RankCard title="Top products" rows={topProducts.map((p) => ({ name: p.name, primary: m(p.revenue), secondary: `${p.units} sold · ${m(p.profit)} profit` }))} />
        <RankCard title="Top customers" rows={topCustomers.map((c) => ({ name: c.name, primary: m(c.revenue), secondary: `${c.orders} orders · AOV ${m(c.aov)}` }))} />
      </div>
    </>
  );
}

// ---------- Sales ----------
async function SalesDashboard({ ctx, period, m }: { ctx: Ctx; period: Period; m: M }) {
  const [byEmployee, byMethod, refunds, growth, topCategories] = await Promise.all([
    reportService.getSalesByEmployee(ctx, period),
    reportService.getSalesByPaymentMethod(ctx, period),
    reportService.getRefundReport(ctx, period),
    reportService.getCustomerGrowth(ctx, period),
    reportService.getTopCategories(ctx, period, 8),
  ]);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-soft">
          <CardContent className="p-5">
            <SectionHeader title="Payment methods" description="Money in, by method" />
            <LazyPaymentPie data={byMethod.map((r) => ({ name: r.method.replace("_", " ").toLowerCase(), value: r.amount }))} />
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-5">
            <SectionHeader title="Customer growth" description="New customers over time" />
            <LazyGrowthChart data={growth.map((g) => ({ bucket: new Date(g.bucket).toISOString(), value: g.newCustomers }))} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <RankCard title="Sales by employee" rows={byEmployee.map((e) => ({ name: e.name, primary: m(e.revenue), secondary: `${e.sales} sales · ${m(e.profit)} profit` }))} />
        <RankCard title="Top categories" rows={topCategories.map((c) => ({ name: c.name, primary: m(c.revenue), secondary: `${c.units} units` }))} />
      </div>

      <Card className="mt-6 shadow-soft">
        <CardContent className="p-5">
          <SectionHeader title="Refunds" description={`${refunds.length} refund${refunds.length === 1 ? "" : "s"} in the period`} />
          {refunds.length === 0 ? <EmptyState title="No refunds" description="Nothing was refunded in this period." /> : (
            <ul className="divide-y">
              {refunds.slice(0, 12).map((r, i) => (
                <li key={i} className="flex items-center gap-4 py-2.5 text-sm">
                  <span className="font-medium">#{r.saleNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.customer ?? "Walk-in"}{r.reference ? ` · ${r.reference}` : ""}</span>
                  <Badge variant="outline">{r.method.replace("_", " ").toLowerCase()}</Badge>
                  <span className="tabular font-semibold text-destructive">−{m(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ---------- Inventory (delegates to Step 6's analytics) ----------
async function InventoryDashboard({ ctx, m }: { ctx: Ctx; m: M }) {
  const [stats, analytics, trend] = await Promise.all([
    inventoryService.getDashboardStats(ctx),
    inventoryService.getAnalytics(ctx),
    inventoryService.getValueTrend(ctx),
  ]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Inventory value (cost)" value={m(stats.costValue)} icon={Boxes} />
        <StatCard label="Value at retail" value={m(stats.retailValue)} icon={Banknote} hint={`potential margin ${m(stats.retailValue - stats.costValue)}`} />
        <StatCard label="Turnover (30d)" value={String(analytics.turnover)} icon={ArrowLeftRight} hint="units sold / avg held" />
        <StatCard label="Dead stock value" value={m(analytics.deadStock.reduce((s, d) => s + d.value, 0))} icon={Receipt} hint={`${analytics.deadStock.length} products, 90d no sales`} />
      </div>
      <Card className="mt-6 shadow-soft">
        <CardContent className="p-5">
          <SectionHeader title="Inventory value trend" description="Approximate, at current cost" />
          <LazyTrendChart data={trend.map((t) => ({ bucket: t.month, revenue: t.value, profit: 0, expenses: 0 }))} series={["revenue"]} labels={{ revenue: "Value" }} />
        </CardContent>
      </Card>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <RankCard title="Fast movers (30d)" rows={analytics.fastMoving.map((f) => ({ name: f.name, primary: `${f.sold} sold`, secondary: "" }))} />
        <RankCard title="Slow movers (in stock)" rows={analytics.slowMoving.map((s) => ({ name: s.name, primary: `${s.sold} sold`, secondary: `${s.quantity} in stock` }))} />
      </div>
    </>
  );
}

// ---------- Financial ----------
async function FinancialDashboard({ ctx, period, m }: { ctx: Ctx; period: Period; m: M }) {
  const [{ summary }, purchases, topSuppliers] = await Promise.all([
    reportService.getFinancialSummary(ctx, period),
    reportService.getPurchaseReport(ctx, period),
    reportService.getTopSuppliers(ctx, period, 5),
  ]);

  const line = (label: string, value: string, strong = false, negative = false) => (
    <div className={`flex justify-between py-1.5 ${strong ? "border-t pt-2 text-base font-semibold" : "text-sm"}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular ${negative ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="shadow-soft xl:col-span-1">
          <CardContent className="p-5">
            <SectionHeader title="Income statement" description={period.label} />
            {line("Revenue (gross)", m(summary.revenue))}
            {line("Net revenue", m(summary.netRevenue))}
            {line("COGS", `−${m(summary.cogs)}`, false, true)}
            {line("Gross profit", m(summary.grossProfit), true)}
            {line(`Gross margin`, `${summary.grossMargin}%`)}
            {line("Operating expenses", `−${m(summary.operatingExpenses)}`, false, true)}
            {line("Net profit", m(summary.netProfit), true)}
            {line("Net margin", `${summary.netMargin}%`)}
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-5">
            <SectionHeader title="Cash flow" description="Actual money movement" />
            {line("Inflows (payments received)", m(summary.cashFlow.inflows))}
            {line("Refunds", `−${m(summary.refunds)}`, false, true)}
            {line("Expenses paid", `−${m(summary.operatingExpenses)}`, false, true)}
            {line("Stock received", `−${m(summary.cashFlow.outflows - summary.operatingExpenses)}`, false, true)}
            {line("Net cash flow", m(summary.cashFlow.net), true, summary.cashFlow.net < 0)}
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-5">
            <SectionHeader title="Balances" description="Money owed, both directions" />
            {line("Customers owe you", m(summary.outstandingCustomers))}
            {line("You owe suppliers", m(summary.outstandingSuppliers))}
            {line("Inventory value (cost)", m(summary.inventoryValue))}
            {line("Tax collected", m(summary.taxCollected))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 shadow-soft">
        <CardContent className="p-5">
          <SectionHeader title="Purchases by supplier" description={period.label} />
          {purchases.length === 0 ? <EmptyState title="No purchases" description="No purchase orders in this period." /> : (
            <ul className="divide-y">
              {purchases.map((p) => (
                <li key={p.supplier} className="flex items-center gap-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{p.supplier}</span>
                  <span className="text-muted-foreground">{p.orders} PO · {p.received}/{p.ordered} received</span>
                  <span className="tabular font-semibold">{m(p.spend)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <RankCard
          title="Top suppliers (received value)"
          rows={topSuppliers.map((s) => ({
            name: s.name,
            primary: m(s.received),
            secondary: `${s.orders} PO · ${s.units} units received`,
          }))}
        />
      </div>
    </>
  );
}

// ---------- shared rank card ----------
function RankCard({ title, rows }: { title: string; rows: { name: string; primary: string; secondary: string }[] }) {
  return (
    <Card className="shadow-soft">
      <CardContent className="p-5">
        <SectionHeader title={title} />
        {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No data in this period.</p> : (
          <ul className="divide-y">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <span className="w-5 text-xs text-muted-foreground">#{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  {r.secondary && <p className="text-xs text-muted-foreground">{r.secondary}</p>}
                </div>
                <span className="tabular text-sm font-semibold">{r.primary}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
