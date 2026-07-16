import Link from "next/link";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { purchaseService } from "@/services/purchase-service";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-primitives";
import { PurchaseActions } from "@/components/purchases/purchase-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Purchase order" };

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusiness();
  const { id } = await params;
  const po = await purchaseService.getById(ctx, id);
  const currency = ctx.business.currency;
  const pdfUrl = `/api/purchases/${po.id}/pdf`;

  return (
    <>
      <PageHeader
        title={`PO-${String(po.purchaseNumber).padStart(5, "0")}`}
        description={`${po.supplier?.name ?? "—"} · created ${new Date(po.createdAt).toLocaleDateString()}${po.expectedAt ? ` · expected ${new Date(po.expectedAt).toLocaleDateString()}` : ""}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" asChild><Link href="/purchases"><ArrowLeft className="size-4" aria-hidden /> Back</Link></Button>
            <Button variant="outline" asChild><a href={pdfUrl} target="_blank"><Printer className="size-4" aria-hidden /> Print</a></Button>
            <Button variant="outline" asChild><a href={pdfUrl} download><FileDown className="size-4" aria-hidden /> PDF</a></Button>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="shadow-soft xl:col-span-2">
          <CardContent className="p-5">
            <Badge variant="secondary" className="mb-3">{po.status.replace("_", " ").toLowerCase()}</Badge>
            <ul className="divide-y">
              {po.items.map((item) => {
                const open = item.quantity - item.receivedQuantity;
                return (
                  <li key={item.id} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} × {formatMoney(Number(item.unitCost), currency)}
                        {item.returnedQuantity > 0 && <span className="text-destructive"> · {item.returnedQuantity} returned</span>}
                      </p>
                    </div>
                    <Badge variant="outline" className={open === 0 ? "text-success" : item.receivedQuantity > 0 ? "text-warning" : "text-muted-foreground"}>
                      {item.receivedQuantity} / {item.quantity} received
                    </Badge>
                    <p className="tabular w-24 text-right text-sm font-semibold">{formatMoney(Number(item.total), currency)}</p>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span><span className="tabular">{formatMoney(Number(po.total), currency)}</span>
            </div>
            {po.notes && <p className="mt-3 rounded-lg bg-secondary p-3 text-sm text-muted-foreground">{po.notes}</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {hasPermission(ctx.role, "purchases:manage") && (
            <PurchaseActions
              purchase={{
                id: po.id,
                status: po.status,
                items: po.items.map((i) => ({
                  purchaseItemId: i.id, name: i.product.name,
                  quantity: i.quantity, receivedQuantity: i.receivedQuantity, returnedQuantity: i.returnedQuantity,
                })),
              }}
            />
          )}

          <Card className="shadow-soft">
            <CardContent className="p-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Receiving history</p>
              <ul className="space-y-2">
                {po.receipts.length === 0 && <li className="text-sm text-muted-foreground">Nothing received yet.</li>}
                {po.receipts.map((r) => (
                  <li key={r.id} className="rounded-lg border p-2.5 text-sm">
                    <p className="font-medium">
                      {(r.lines as { quantity: number }[]).reduce((s, l) => s + l.quantity, 0)} unit(s)
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}{r.notes ? ` · ${r.notes}` : ""}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
