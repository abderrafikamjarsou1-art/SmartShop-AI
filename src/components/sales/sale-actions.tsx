"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Ban } from "lucide-react";
import { toast } from "sonner";
import { processReturn, voidSale } from "@/actions/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SaleForActions {
  id: string;
  status: string;
  hasCustomer: boolean;
  items: { saleItemId: string; name: string; quantity: number; returnedQuantity: number }[];
}

/** Manager actions on a sale: partial/full return + void (full reversal). */
export function SaleActions({ sale, currency }: { sale: SaleForActions; currency: string }) {
  const router = useRouter();
  const [returnOpen, setReturnOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const returnable = sale.items.some((i) => i.quantity - i.returnedQuantity > 0);
  const active = ["COMPLETED", "PARTIALLY_RETURNED"].includes(sale.status);

  if (!active) return null;

  return (
    <Card className="shadow-soft">
      <CardContent className="space-y-2 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</p>
        <Button variant="outline" className="w-full justify-start" disabled={!returnable} onClick={() => setReturnOpen(true)}>
          <RotateCcw className="size-4" aria-hidden /> Return items
        </Button>
        <Button variant="outline" className="w-full justify-start text-destructive" onClick={() => setVoidOpen(true)}>
          <Ban className="size-4" aria-hidden /> Void sale
        </Button>

        <ReturnDialog sale={sale} currency={currency} open={returnOpen} onOpenChange={setReturnOpen}
          onDone={() => router.refresh()} />

        {/* Void: reason captured via a small controlled input inside the confirm */}
        <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Void this sale?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              All remaining items return to stock, all payments are reversed, and the sale is marked voided. This can&apos;t be undone.
            </p>
            <div className="space-y-2">
              <Label htmlFor="voidReason">Reason</Label>
              <Input id="voidReason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Cashier error" autoFocus />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setVoidOpen(false)}>Cancel</Button>
              <VoidButton saleId={sale.id} reason={voidReason} onDone={() => { setVoidOpen(false); router.refresh(); }} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function VoidButton({ saleId, reason, onDone }: { saleId: string; reason: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="destructive" disabled={pending || !reason.trim()}
      onClick={() => start(async () => {
        const r = await voidSale({ id: saleId, reason });
        if (r.success) { toast.success("Sale voided — stock restored, payments reversed."); onDone(); }
        else toast.error(r.error);
      })}>
      {pending ? "Voiding…" : "Void sale"}
    </Button>
  );
}

// ---------- Return dialog (partial/full) ----------
function ReturnDialog({ sale, currency, open, onOpenChange, onDone }: {
  sale: SaleForActions; currency: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"CASH" | "STORE_CREDIT">("CASH");
  const [pending, start] = useTransition();

  const items = sale.items.filter((i) => i.quantity - i.returnedQuantity > 0);
  const selected = Object.entries(quantities).filter(([, q]) => q > 0);
  const returnAll = () =>
    setQuantities(Object.fromEntries(items.map((i) => [i.saleItemId, i.quantity - i.returnedQuantity])));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Return items</DialogTitle></DialogHeader>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={returnAll}>Return everything</Button>
        </div>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {items.map((i) => {
            const max = i.quantity - i.returnedQuantity;
            return (
              <li key={i.saleItemId} className="flex items-center gap-3 rounded-lg border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{max} returnable</p>
                </div>
                <Input
                  type="number" min="0" max={max} value={quantities[i.saleItemId] ?? ""}
                  placeholder="0" aria-label={`Return quantity for ${i.name}`}
                  onChange={(e) => setQuantities((q) => ({ ...q, [i.saleItemId]: Math.min(max, Math.max(0, Number(e.target.value) || 0)) }))}
                  className="tabular h-9 w-20 text-right"
                />
              </li>
            );
          })}
        </ul>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="returnReason">Reason</Label>
            <Input id="returnReason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective" />
          </div>
          <div className="space-y-1.5">
            <Label>Refund to</Label>
            <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as typeof refundMethod)}>
              <SelectTrigger aria-label="Refund method"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="STORE_CREDIT" disabled={!sale.hasCustomer}>Store credit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button disabled={pending || selected.length === 0 || !reason.trim()}
            onClick={() => start(async () => {
              const r = await processReturn({
                saleId: sale.id,
                items: selected.map(([saleItemId, quantity]) => ({ saleItemId, quantity })),
                reason, refundMethod,
              });
              if (r.success) {
                toast.success(`Return processed — refund ${r.data.refund.toFixed(2)} ${currency} (${refundMethod === "CASH" ? "cash" : "store credit"}).`);
                onOpenChange(false); onDone();
              } else toast.error(r.error);
            })}>
            {pending ? "Processing…" : "Process return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
