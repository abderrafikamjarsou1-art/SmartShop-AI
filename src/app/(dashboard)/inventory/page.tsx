import Link from "next/link";
import { Package, Boxes, AlertTriangle, PackageX, Turtle, Rabbit, Skull } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { inventoryService } from "@/services/inventory-service";
import { formatMoney } from "@/lib/format";
import { PageHeader, SectionHeader, StatCard } from "@/components/shared/page-primitives";
import { InventoryTabs } from "@/components/inventory/inventory-tabs";
import { LazyInventoryTrendChart } from "@/components/charts/lazy-inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Inventory" };

/**
 * Inventory overview — Server Component, real data (no more mocks).
 * Stats + value trend + analytics (turnover, movers, dead stock)
 * + recent adjustments, all computed by the service from the ledger.
 */
export default async function InventoryPage() {
  const ctx = await requireBusiness();
  const currency = ctx.business.currency;

  const [stats, trend, analytics] = await Promise.all([
    inventoryService.getDashboardStats(ctx),
    inventoryService.getValueTrend(ctx),
    inventoryService.getAnalytics(ctx),
  ]);

  return (
    <>
      <PageHeader title="Inventory" description="Stock levels, valuation and movement history." />
      <InventoryTabs />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total products" value={String(stats.totalProducts)} icon={Package} />
        <StatCard label="Stock value (cost)" value={formatMoney(stats.costValue, currency)}
          hint={`retail ${formatMoney(stats.retailValue, currency)}`} icon={Boxes} />
        <StatCard label="Low stock" value={String(stats.lowStockCount)}
          hint="at or below minimum" icon={AlertTriangle} />
        <StatCard label="Out of stock" value={String(stats.outOfStockCount)} icon={PackageX} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Value trend */}
        <Card className="shadow-soft xl:col-span-3">
          <CardContent className="p-5">
            <SectionHeader title="Inventory value" description="At cost, last 6 months" />
            <LazyInventoryTrendChart data={trend} />
          </CardContent>
        </Card>

        {/* Turnover + recent adjustments */}
        <Card className="shadow-soft xl:col-span-2">
          <CardContent className="p-5">
            <SectionHeader title="Turnover" description="Units sold vs. stock held, 30 days" />
            <div className="flex items-baseline gap-3">
              <p data-slot="stat-value" className="display-tight text-3xl font-semibold">{analytics.turnover}×</p>
              <p className="text-sm text-muted-foreground">{analytics.unitsSold30d} units sold</p>
            </div>
            <SectionHeader title="Recent adjustments" />
            {stats.recentAdjustments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No manual adjustments yet.</p>
            ) : (
              <ul className="divide-y">
                {stats.recentAdjustments.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.product.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.reason ?? "—"} · {m.user?.fullName ?? m.user?.email ?? "system"}
                      </p>
                    </div>
                    <Badge variant="secondary" className={`tabular ${m.quantity > 0 ? "text-success" : "text-destructive"}`}>
                      {m.quantity > 0 ? "+" : ""}{m.quantity}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analytics: movers + dead stock */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="shadow-soft">
          <CardContent className="p-5">
            <SectionHeader title="Fast moving" description="Most sold, 30 days" />
            <MoversList
              items={analytics.fastMoving.map((m) => ({ id: m.productId, name: m.name, badge: `${m.sold} sold` }))}
              icon={<Rabbit className="size-4 text-success" aria-hidden />}
              empty="No sales in the last 30 days."
            />
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-5">
            <SectionHeader title="Slow moving" description="Least sold, still in stock" />
            <MoversList
              items={analytics.slowMoving.map((m) => ({ id: m.productId, name: m.name, badge: `${m.sold} sold` }))}
              icon={<Turtle className="size-4 text-warning" aria-hidden />}
              empty="Nothing to show yet."
            />
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-5">
            <SectionHeader title="Dead stock" description="No sales in 90 days" />
            <MoversList
              items={analytics.deadStock.map((d) => ({
                id: d.id, name: d.name, badge: formatMoney(d.value, currency), badgeTone: "text-destructive",
              }))}
              icon={<Skull className="size-4 text-muted-foreground" aria-hidden />}
              empty="No dead stock — nice."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function MoversList({
  items, icon, empty, }: {
  items: { id: string; name: string; badge: string; badgeTone?: string }[];
  icon: React.ReactNode;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 py-2.5">
          {icon}
          <Link href={`/products?q=${encodeURIComponent(item.name)}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
            {item.name}
          </Link>
          <span className={`tabular text-xs font-medium ${item.badgeTone ?? "text-muted-foreground"}`}>{item.badge}</span>
        </li>
      ))}
    </ul>
  );
}
