import Link from "next/link";
import { ArrowLeft, Banknote, CalendarClock, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { customerService } from "@/services/customer-service";
import { formatMoney } from "@/lib/format";
import { PageHeader, SectionHeader, StatCard } from "@/components/shared/page-primitives";
import { ActivityTimeline, ContactDrawer } from "@/components/contacts/shared";
import { RecordPaymentDialog } from "@/components/customers/customers-table";
import { EditContactButton } from "@/components/contacts/edit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Customer" };

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusiness();
  const { id } = await params;
  const currency = ctx.business.currency;

  const [{ customer, kpis, favorites, recentSales, payments }, timeline] = await Promise.all([
    customerService.getProfile(ctx, id),
    customerService.getTimeline(ctx, id),
  ]);

  return (
    <>
      <PageHeader
        title={customer.name}
        description={[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" asChild><Link href="/customers"><ArrowLeft className="size-4" aria-hidden /> Back</Link></Button>
            <EditContactButton
              kind="customer"
              initial={{
                id: customer.id, name: customer.name, email: customer.email ?? "", phone: customer.phone ?? "",
                address: customer.address ?? "", notes: customer.notes ?? "", tags: customer.tags.join(", "),
              }}
            />
            <RecordPaymentDialog customerId={customer.id} owed={kpis.outstandingBalance} storeCredit={kpis.storeCredit} currency={currency} />
          </div>
        }
      />

      {customer.tags.length > 0 && (
        <div className="mb-4 flex gap-1.5">
          {customer.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Lifetime value" value={formatMoney(kpis.ltv, currency)} icon={TrendingUp} />
        <StatCard label="Orders" value={String(kpis.orders)} hint={`AOV ${formatMoney(kpis.aov, currency)}`} icon={ShoppingBag} />
        <StatCard label="Outstanding" value={formatMoney(kpis.outstandingBalance, currency)}
          hint={kpis.outstandingBalance > 0 ? "owes you" : "settled"} icon={Banknote} />
        <StatCard label="Store credit" value={formatMoney(kpis.storeCredit, currency)} icon={Wallet} />
        <StatCard label="Last purchase"
          value={kpis.lastPurchase ? new Date(kpis.lastPurchase).toLocaleDateString() : "—"} icon={CalendarClock} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Purchase history */}
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <SectionHeader title="Purchase history" description="Latest 10 sales" />
              <ul className="divide-y">
                {recentSales.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No purchases yet.</li>}
                {recentSales.map((s) => (
                  <li key={s.id}>
                    <Link href={`/sales/${s.id}`} className="flex items-center gap-3 py-3 hover:bg-secondary/40">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">Sale #{s.saleNumber}
                          {s.invoice && <span className="ml-2 text-xs text-muted-foreground">INV-{String(s.invoice.invoiceNumber).padStart(5, "0")}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{s.paymentStatus.toLowerCase()}</Badge>
                      <p className="tabular w-24 text-right text-sm font-semibold">{formatMoney(Number(s.total), currency)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Payment history */}
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <SectionHeader title="Account payments" />
              <ul className="divide-y">
                {payments.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No account payments recorded.</li>}
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{p.method.replace("_", " ").toLowerCase()}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleString()}
                        {(p.allocations as { saleNumber: number }[]).length > 0 &&
                          ` · applied to ${(p.allocations as { saleNumber: number }[]).map((a) => `#${a.saleNumber}`).join(", ")}`}
                      </p>
                    </div>
                    <p className="tabular text-sm font-semibold text-success">{formatMoney(Number(p.amount), currency)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Favorite products */}
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <SectionHeader title="Favorite products" />
              <ul className="space-y-2">
                {favorites.length === 0 && <li className="text-sm text-muted-foreground">Not enough data yet.</li>}
                {favorites.map((f, i) => (
                  <li key={f.name} className="flex items-center justify-between text-sm">
                    <span className="min-w-0 truncate">{i + 1}. {f.name}</span>
                    <Badge variant="secondary" className="tabular">{f.units}×</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <SectionHeader title="Activity" />
              <ActivityTimeline
                events={timeline.map((e) => ({ ...e, at: e.at.toISOString() }))}
                currency={currency}
              />
            </CardContent>
          </Card>

          {customer.notes && (
            <Card className="shadow-soft">
              <CardContent className="p-5">
                <SectionHeader title="Notes" />
                <p className="text-sm text-muted-foreground">{customer.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
