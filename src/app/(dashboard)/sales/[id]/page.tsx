import Link from "next/link";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { saleService } from "@/services/sale-service";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-primitives";
import { SaleActions } from "@/components/sales/sale-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Sale" };

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusiness();
  const { id } = await params;
  const sale = await saleService.getById(ctx, id);
  const currency = ctx.business.currency;
  const canManage = hasPermission(ctx.role, "sales:manage");
  const pdfUrl = sale.invoice ? `/api/invoices/${sale.id}/pdf` : null;

  return (
    <>
      <PageHeader
        title={`Sale #${sale.saleNumber}`}
        description={`${new Date(sale.createdAt).toLocaleString()} · ${sale.user?.fullName ?? sale.user?.email ?? "—"}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" asChild><Link href="/sales"><ArrowLeft className="size-4" aria-hidden /> Back</Link></Button>
            {pdfUrl && (
              <>
                <Button variant="outline" asChild><a href={pdfUrl} target="_blank"><Printer className="size-4" aria-hidden /> Print</a></Button>
                <Button variant="outline" asChild><a href={pdfUrl} download><FileDown className="size-4" aria-hidden /> Invoice PDF</a></Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Items */}
        <Card className="shadow-soft xl:col-span-2">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary">{sale.status.replace("_", " ").toLowerCase()}</Badge>
              <Badge variant="outline">{sale.paymentStatus.toLowerCase()}</Badge>
              {sale.invoice && <span className="text-xs text-muted-foreground">INV-{String(sale.invoice.invoiceNumber).padStart(5, "0")}</span>}
            </div>
            <ul className="divide-y">
              {sale.items.map((item) => (
                <li key={item.id} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × {formatMoney(Number(item.unitPrice), currency)}
                      {Number(item.discountAmount) > 0 && ` · −${formatMoney(Number(item.discountAmount), currency)}`}
                      {item.returnedQuantity > 0 && <span className="text-warning"> · {item.returnedQuantity} returned</span>}
                    </p>
                  </div>
                  <p className="tabular text-sm font-semibold">{formatMoney(Number(item.total), currency)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular">{formatMoney(Number(sale.subtotal), currency)}</span></div>
              {Number(sale.discountAmount) > 0 && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span className="tabular">−{formatMoney(Number(sale.discountAmount), currency)}</span></div>}
              <div className="flex justify-between text-muted-foreground"><span>Tax ({Number(sale.taxRate)}%)</span><span className="tabular">{formatMoney(Number(sale.taxAmount), currency)}</span></div>
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span className="tabular">{formatMoney(Number(sale.total), currency)}</span></div>
            </div>
            {sale.notes && <p className="mt-3 rounded-lg bg-secondary p-3 text-sm text-muted-foreground">{sale.notes}</p>}
          </CardContent>
        </Card>

        {/* Right column: customer, payments, actions */}
        <div className="space-y-4">
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Customer</p>
              <p className="text-sm font-medium">{sale.customer?.name ?? "Walk-in customer"}</p>
              {sale.customer?.phone && <p className="text-xs text-muted-foreground">{sale.customer.phone}</p>}
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardContent className="p-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Payments</p>
              <ul className="space-y-1.5">
                {sale.payments.length === 0 && <li className="text-sm text-muted-foreground">No payments recorded.</li>}
                {sale.payments.map((p) => (
                  <li key={p.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {p.method.replace("_", " ").toLowerCase()}
                      {Number(p.amount) < 0 && <span className="text-destructive"> (refund)</span>}
                    </span>
                    <span className={`tabular font-medium ${Number(p.amount) < 0 ? "text-destructive" : ""}`}>
                      {formatMoney(Number(p.amount), currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between border-t pt-2 text-sm font-medium">
                <span>Paid</span><span className="tabular">{formatMoney(Number(sale.amountPaid), currency)}</span>
              </div>
            </CardContent>
          </Card>

          {canManage && (
            <SaleActions
              sale={{
                id: sale.id,
                status: sale.status,
                hasCustomer: !!sale.customerId,
                items: sale.items.map((i) => ({
                  saleItemId: i.id, name: i.product.name,
                  quantity: i.quantity, returnedQuantity: i.returnedQuantity,
                })),
              }}
              currency={currency}
            />
          )}
        </div>
      </div>
    </>
  );
}
