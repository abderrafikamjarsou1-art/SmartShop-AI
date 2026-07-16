import Link from "next/link";
import { ArrowLeft, Banknote, CalendarClock, Clock, Truck } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { supplierService } from "@/services/supplier-service";
import { formatMoney } from "@/lib/format";
import { PageHeader, SectionHeader, StatCard } from "@/components/shared/page-primitives";
import { ActivityTimeline } from "@/components/contacts/shared";
import { EditContactButton } from "@/components/contacts/edit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Supplier" };

export default async function SupplierProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusiness();
  const { id } = await params;
  const currency = ctx.business.currency;

  const [{ supplier, kpis, products, openPos, recentPos }, timeline] = await Promise.all([
    supplierService.getProfile(ctx, id),
    supplierService.getTimeline(ctx, id),
  ]);

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={[supplier.contactPerson, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "No contact details"}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" asChild><Link href="/suppliers"><ArrowLeft className="size-4" aria-hidden /> Back</Link></Button>
            <EditContactButton
              kind="supplier"
              initial={{
                id: supplier.id, name: supplier.name, email: supplier.email ?? "", phone: supplier.phone ?? "",
                address: supplier.address ?? "", notes: supplier.notes ?? "", contactPerson: supplier.contactPerson ?? "",
              }}
            />
            <Button asChild><Link href="/purchases">New purchase order</Link></Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total spend" value={formatMoney(kpis.totalSpend, currency)}
          hint={`${kpis.orderCount} order${kpis.orderCount === 1 ? "" : "s"}`} icon={Banknote} />
        <StatCard label="Avg lead time"
          value={kpis.avgLeadTimeDays !== null ? `${kpis.avgLeadTimeDays} days` : "—"}
          hint="order to delivery" icon={Clock} />
        <StatCard label="Open orders" value={String(kpis.openOrders)} icon={Truck} />
        <StatCard label="Last purchase"
          value={kpis.lastPurchase ? new Date(kpis.lastPurchase).toLocaleDateString() : "—"} icon={CalendarClock} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Outstanding POs */}
          {openPos.length > 0 && (
            <Card className="shadow-soft">
              <CardContent className="p-5">
                <SectionHeader title="Outstanding purchase orders" description="Waiting for delivery" />
                <ul className="divide-y">
                  {openPos.map((po) => {
                    const ordered = po.items.reduce((s, i) => s + i.quantity, 0);
                    const received = po.items.reduce((s, i) => s + i.receivedQuantity, 0);
                    return (
                      <li key={po.id}>
                        <Link href={`/purchases/${po.id}`} className="flex items-center gap-3 py-3 hover:bg-secondary/40">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">PO-{String(po.purchaseNumber).padStart(5, "0")}</p>
                            <p className="text-xs text-muted-foreground">
                              {po.expectedAt ? `expected ${new Date(po.expectedAt).toLocaleDateString()}` : "no delivery date"}
                            </p>
                          </div>
                          <Badge variant="outline" className={received > 0 ? "text-warning" : "text-muted-foreground"}>
                            {received} / {ordered}
                          </Badge>
                          <p className="tabular w-24 text-right text-sm font-semibold">{formatMoney(Number(po.total), currency)}</p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Products supplied with pricing */}
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <SectionHeader title="Products supplied" description="With average and latest negotiated cost" />
              <ul className="divide-y">
                {products.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No purchases from this supplier yet.</li>}
                {products.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku ?? "—"} · {p.units} unit(s) received</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>avg <span className="tabular font-medium text-foreground">{formatMoney(p.avgCost, currency)}</span></p>
                      <p>last <span className="tabular font-medium text-foreground">{formatMoney(p.lastCost, currency)}</span></p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Purchase history */}
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <SectionHeader title="Purchase history" description="Latest 10 orders" />
              <ul className="divide-y">
                {recentPos.map((po) => (
                  <li key={po.id}>
                    <Link href={`/purchases/${po.id}`} className="flex items-center gap-3 py-3 hover:bg-secondary/40">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">PO-{String(po.purchaseNumber).padStart(5, "0")}</p>
                        <p className="text-xs text-muted-foreground">{new Date(po.createdAt).toLocaleDateString()}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs">{po.status.replace("_", " ").toLowerCase()}</Badge>
                      <p className="tabular w-24 text-right text-sm font-semibold">{formatMoney(Number(po.total), currency)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <SectionHeader title="Activity" />
              <ActivityTimeline
                events={timeline.map((e) => ({ ...e, at: e.at.toISOString() }))}
                currency={currency}
              />
            </CardContent>
          </Card>

          {supplier.notes && (
            <Card className="shadow-soft">
              <CardContent className="p-5">
                <SectionHeader title="Notes" />
                <p className="text-sm text-muted-foreground">{supplier.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
