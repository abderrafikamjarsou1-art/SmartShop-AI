"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, PackageCheck, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { sendPurchase, cancelPurchase, receivePurchase, returnPurchase } from "@/actions/purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/interactive";

interface PoForActions {
  id: string;
  status: string;
  items: { purchaseItemId: string; name: string; quantity: number; receivedQuantity: number; returnedQuantity: number }[];
}

export function PurchaseActions({ purchase }: { purchase: PoForActions }) {
  const router = useRouter();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [, start] = useTransition();

  const receivable = ["ORDERED", "PARTIALLY_RECEIVED"].includes(purchase.status)
    && purchase.items.some((i) => i.quantity - i.receivedQuantity > 0);
  const returnable = purchase.items.some((i) => i.receivedQuantity - i.returnedQuantity > 0);
  const cancellable = ["DRAFT", "ORDERED"].includes(purchase.status)
    && !purchase.items.some((i) => i.receivedQuantity > 0);

  return (
    <Card className="shadow-soft">
      <CardContent className="space-y-2 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</p>

        {purchase.status === "DRAFT" && (
          <Button className="w-full justify-start" onClick={() => start(async () => {
            const r = await sendPurchase(purchase.id);
            r.success ? (toast.success("PO marked as ordered."), router.refresh()) : toast.error(r.error);
          })}>
            <Send className="size-4" aria-hidden /> Send / mark ordered
          </Button>
        )}

        <Button variant="outline" className="w-full justify-start" disabled={!receivable} onClick={() => setReceiveOpen(true)}>
          <PackageCheck className="size-4" aria-hidden /> Receive items
        </Button>
        <Button variant="outline" className="w-full justify-start" disabled={!returnable} onClick={() => setReturnOpen(true)}>
          <RotateCcw className="size-4" aria-hidden /> Return to supplier
        </Button>
        {cancellable && (
          <Button variant="outline" className="w-full justify-start text-destructive" onClick={() => setCancelOpen(true)}>
            <Ban className="size-4" aria-hidden /> Cancel order
          </Button>
        )}

        <ReceiveDialog purchase={purchase} open={receiveOpen} onOpenChange={setReceiveOpen} onDone={() => router.refresh()} />
        <ReturnDialog purchase={purchase} open={returnOpen} onOpenChange={setReturnOpen} onDone={() => router.refresh()} />
        <ConfirmDialog
          open={cancelOpen} onOpenChange={setCancelOpen}
          title="Cancel this purchase order?" description="The order will be marked cancelled. Nothing has been received, so stock is untouched."
          confirmLabel="Cancel order" destructive
          onConfirm={async () => {
            const r = await cancelPurchase(purchase.id);
            r.success ? (toast.success("Purchase order cancelled."), router.refresh()) : toast.error(r.error);
          }}
        />
      </CardContent>
    </Card>
  );
}

// ---------- Receive dialog (partial/full, idempotent) ----------
function ReceiveDialog({ purchase, open, onOpenChange, onDone }: {
  purchase: PoForActions; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [updateCost, setUpdateCost] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  // ONE clientRef per open dialog: double-clicking "Receive" can only land once
  const clientRef = useMemo(() => crypto.randomUUID(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const openItems = purchase.items.filter((i) => i.quantity - i.receivedQuantity > 0);
  const selected = Object.entries(quantities).filter(([, q]) => q > 0);
  const receiveAll = () =>
    setQuantities(Object.fromEntries(openItems.map((i) => [i.purchaseItemId, i.quantity - i.receivedQuantity])));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Receive items</DialogTitle></DialogHeader>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={receiveAll}>Receive everything</Button>
        </div>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {openItems.map((i) => {
            const max = i.quantity - i.receivedQuantity;
            return (
              <li key={i.purchaseItemId} className="flex items-center gap-3 rounded-lg border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{max} still expected</p>
                </div>
                <Input type="number" min="0" max={max} value={quantities[i.purchaseItemId] ?? ""}
                  placeholder="0" aria-label={`Receive quantity for ${i.name}`}
                  onChange={(e) => setQuantities((q) => ({ ...q, [i.purchaseItemId]: Math.min(max, Math.max(0, Number(e.target.value) || 0)) }))}
                  className="tabular h-9 w-20 text-right" />
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div>
            <Label htmlFor="updateCost">Update product costs</Label>
            <p className="text-xs text-muted-foreground">Copy this order's unit costs to the products.</p>
          </div>
          <Switch id="updateCost" checked={updateCost} onCheckedChange={setUpdateCost} />
        </div>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Receipt notes (delivery ref…)" aria-label="Receipt notes" />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button disabled={pending || selected.length === 0}
            onClick={() => start(async () => {
              const r = await receivePurchase({
                purchaseId: purchase.id, clientRef,
                items: selected.map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity })),
                updateProductCost: updateCost, notes: notes || undefined,
              });
              if (r.success) { toast.success("Items received — stock updated."); onOpenChange(false); onDone(); }
              else toast.error(r.error);
            })}>
            {pending ? "Receiving…" : "Receive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Return-to-supplier dialog ----------
function ReturnDialog({ purchase, open, onOpenChange, onDone }: {
  purchase: PoForActions; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const items = purchase.items.filter((i) => i.receivedQuantity - i.returnedQuantity > 0);
  const selected = Object.entries(quantities).filter(([, q]) => q > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Return to supplier</DialogTitle></DialogHeader>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {items.map((i) => {
            const max = i.receivedQuantity - i.returnedQuantity;
            return (
              <li key={i.purchaseItemId} className="flex items-center gap-3 rounded-lg border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{max} returnable</p>
                </div>
                <Input type="number" min="0" max={max} value={quantities[i.purchaseItemId] ?? ""}
                  placeholder="0" aria-label={`Return quantity for ${i.name}`}
                  onChange={(e) => setQuantities((q) => ({ ...q, [i.purchaseItemId]: Math.min(max, Math.max(0, Number(e.target.value) || 0)) }))}
                  className="tabular h-9 w-20 text-right" />
              </li>
            );
          })}
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="poReturnReason">Reason</Label>
          <Input id="poReturnReason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged in transit" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button variant="destructive" disabled={pending || selected.length === 0 || !reason.trim()}
            onClick={() => start(async () => {
              const r = await returnPurchase({
                purchaseId: purchase.id,
                items: selected.map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity })),
                reason,
              });
              if (r.success) { toast.success("Return recorded — stock updated."); onOpenChange(false); onDone(); }
              else toast.error(r.error);
            })}>
            {pending ? "Processing…" : "Return items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
