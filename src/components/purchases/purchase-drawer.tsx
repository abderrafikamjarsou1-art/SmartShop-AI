"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createPurchase, importPurchaseCsv } from "@/actions/purchases";
import { round2 } from "@/lib/sale-math";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface ProductOption { id: string; name: string; sku: string | null; buyingPrice: number }
interface Line { productId: string; quantity: number; unitCost: number }

/**
 * New PO drawer. Two paths to the same place:
 *  - build lines manually (product select pre-fills last known cost)
 *  - import a CSV (sku,quantity,unitCost) -> draft PO in one call
 */
export function PurchaseDrawerTrigger({ suppliers, products, label }: {
  suppliers: { id: string; name: string }[];
  products: ProductOption[];
  label: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const addLine = () => setLines((l) => [...l, { productId: "", quantity: 1, unitCost: 0 }]);
  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((l) => l.map((line, li) => (li === i ? { ...line, ...patch } : line)));
  const total = round2(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));
  const valid = supplierId && lines.length > 0 && lines.every((l) => l.productId && l.quantity > 0);

  const submit = (status: "DRAFT" | "ORDERED") =>
    start(async () => {
      const r = await createPurchase({
        supplierId, status, items: lines,
        notes: notes || undefined,
        expectedAt: expectedAt || undefined,
      });
      if (r.success) {
        toast.success(`PO-${String(r.data.purchaseNumber).padStart(5, "0")} ${status === "DRAFT" ? "saved as draft" : "created and marked ordered"}.`);
        setOpen(false); setLines([]); setSupplierId(""); setNotes(""); setExpectedAt("");
        router.push(`/purchases/${r.data.id}`);
      } else toast.error(r.error);
    });

  const importCsv = (file: File) =>
    start(async () => {
      if (!supplierId) { toast.error("Select a supplier first."); return; }
      const csvText = await file.text();
      const r = await importPurchaseCsv({ supplierId, csvText });
      if (r.success) {
        toast.success(`Draft PO-${String(r.data.purchaseNumber).padStart(5, "0")} created — ${r.data.imported} line(s).`);
        if (r.data.errors.length) toast.warning(`${r.data.errors.length} row(s) skipped (row ${r.data.errors[0].row}: ${r.data.errors[0].error})`);
        setOpen(false);
        router.push(`/purchases/${r.data.id}`);
      } else toast.error(r.error);
    });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button>{label}</Button></SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>New purchase order</SheetTitle>
          <SheetDescription>Order stock from a supplier — receive it later, in parts if needed.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger aria-label="Supplier"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expectedAt">Expected delivery</Label>
              <Input id="expectedAt" type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lines</Label>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                  <FileUp className="size-3.5" aria-hidden /> Import CSV
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="size-3.5" aria-hidden /> Add line
                </Button>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Import CSV"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />

            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                <Select value={line.productId} onValueChange={(v) => {
                  const product = products.find((p) => p.id === v);
                  updateLine(i, { productId: v, unitCost: product?.buyingPrice ?? 0 }); // pre-fill last cost
                }}>
                  <SelectTrigger className="flex-1" aria-label="Product"><SelectValue placeholder="Product…" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min="1" value={line.quantity} aria-label="Quantity"
                  onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 1 })}
                  className="tabular h-9 w-20 text-right" />
                <Input type="number" step="0.01" min="0" value={line.unitCost} aria-label="Unit cost"
                  onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) || 0 })}
                  className="tabular h-9 w-24 text-right" />
                <Button variant="ghost" size="icon" className="size-8" aria-label="Remove line"
                  onClick={() => setLines((l) => l.filter((_, li) => li !== i))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            {lines.length === 0 && (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Add lines manually or import a CSV (sku, quantity, unitCost).
              </p>
            )}
          </div>

          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for the supplier…" rows={2} aria-label="Notes" />

          <p className="tabular text-right text-lg font-semibold">Total: {total.toFixed(2)}</p>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button variant="outline" disabled={pending || !valid} onClick={() => submit("DRAFT")}>Save draft</Button>
          <Button disabled={pending || !valid} onClick={() => submit("ORDERED")}>
            {pending ? "Saving…" : "Create & mark ordered"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
