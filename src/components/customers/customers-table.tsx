"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Trash2, Banknote } from "lucide-react";
import { toast } from "sonner";
import { deleteCustomer, restoreCustomer, recordCustomerPayment } from "@/actions/contacts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/page-primitives";
import { SearchInput, DeleteDialog } from "@/components/shared/interactive";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";

export interface CustomerRow {
  id: string; name: string; phone: string | null; email: string | null;
  tags: string[]; outstandingBalance: number; storeCredit: number; createdAt: string;
}

export function CustomersTable({ customers, currency, trashView }: {
  customers: CustomerRow[]; currency: string; trashView: boolean;
}) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);
  const [, start] = useTransition();

  if (customers.length === 0) {
    return <EmptyState title={trashView ? "Trash is empty" : "No customers yet"}
      description={trashView ? "Deleted customers can be restored from here." : "Add customers to track their purchases, balances and store credit."} />;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Tags</TableHead>
              <TableHead>Owes</TableHead><TableHead>Credit</TableHead><TableHead>Since</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => !trashView && router.push(`/customers/${c.id}`)}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {c.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                  </div>
                </TableCell>
                <TableCell className={`tabular ${c.outstandingBalance > 0 ? "font-medium text-warning" : "text-muted-foreground"}`}>
                  {c.outstandingBalance > 0 ? formatMoney(c.outstandingBalance, currency) : "—"}
                </TableCell>
                <TableCell className={`tabular ${c.storeCredit > 0 ? "font-medium text-success" : "text-muted-foreground"}`}>
                  {c.storeCredit > 0 ? formatMoney(c.storeCredit, currency) : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {trashView ? (
                    <Button variant="ghost" size="icon" aria-label={`Restore ${c.name}`}
                      onClick={() => start(async () => {
                        const r = await restoreCustomer(c.id);
                        r.success ? toast.success("Customer restored.") : toast.error(r.error);
                      })}>
                      <RotateCcw className="size-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`} onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        resourceName={deleteTarget?.name ?? "customer"}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const r = await deleteCustomer(deleteTarget.id);
          r.success ? toast.success("Customer moved to trash.") : toast.error(r.error);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

export function CustomersToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trashView = searchParams.get("deleted") === "true";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") params.delete(key); else params.set(key, value);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchInput placeholder="Name, phone or email…" />
      <Select value={searchParams.get("balance") ?? "all"} onValueChange={(v) => setParam("balance", v)}>
        <SelectTrigger className="w-40" aria-label="Filter by balance"><SelectValue placeholder="Balance" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Everyone</SelectItem>
          <SelectItem value="owing">With outstanding balance</SelectItem>
          <SelectItem value="credit">With store credit</SelectItem>
        </SelectContent>
      </Select>
      <Button variant={trashView ? "secondary" : "ghost"} size="sm" className="ml-auto"
        onClick={() => setParam("deleted", trashView ? "all" : "true")}>
        <Trash2 className="size-4" aria-hidden /> {trashView ? "Back to customers" : "Trash"}
      </Button>
    </div>
  );
}

// ---------- Record payment dialog (used on the profile page) ----------
export function RecordPaymentDialog({ customerId, owed, storeCredit, currency }: {
  customerId: string; owed: number; storeCredit: number; currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(owed.toFixed(2));
  const [method, setMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER" | "STORE_CREDIT">("CASH");
  const [reference, setReference] = useState("");
  const [pending, start] = useTransition();

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={owed <= 0}>
        <Banknote className="size-4" aria-hidden /> Record payment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Outstanding: <span className="tabular font-medium text-foreground">{formatMoney(owed, currency)}</span>
            {storeCredit > 0 && <> · Credit available: <span className="tabular text-success">{formatMoney(storeCredit, currency)}</span></>}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount</Label>
              <Input id="pay-amount" type="number" step="0.01" min="0" max={owed}
                value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular" />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                  <SelectItem value="STORE_CREDIT" disabled={storeCredit <= 0}>Store credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Reference</Label>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt #, transfer ref…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button disabled={pending || Number(amount) <= 0}
              onClick={() => start(async () => {
                const r = await recordCustomerPayment({ customerId, method, amount, reference: reference || undefined });
                if (r.success) {
                  const applied = r.data.allocations.map((a) => `#${a.saleNumber}`).join(", ");
                  toast.success(`Payment recorded${applied ? ` — applied to ${applied}` : ""}.`);
                  setOpen(false); router.refresh();
                } else toast.error(r.error);
              })}>
              {pending ? "Recording…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
