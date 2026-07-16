"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, ShoppingBag, RotateCcw, Banknote, Truck, PackageCheck, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  createCustomer, updateCustomer, createSupplier, updateSupplier,
  previewCustomerImport, commitCustomerImport, previewSupplierImport, commitSupplierImport,
} from "@/actions/contacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/* =====================================================
   Shared contact UI — one drawer + one import dialog +
   one export menu + one timeline for BOTH modules.
   ===================================================== */

// ---------- Create/Edit drawer ----------
export interface ContactValues {
  id?: string; name: string; email: string; phone: string;
  address: string; notes: string;
  tags?: string;           // customers only (comma-separated in the UI)
  contactPerson?: string;  // suppliers only
}

export function ContactDrawer({ kind, initial, label, open, onOpenChange }: {
  kind: "customer" | "supplier";
  initial?: ContactValues;
  label?: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const router = useRouter();
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = controlled ? open : internalOpen;
  const setOpen = controlled ? onOpenChange! : setInternalOpen;
  const [values, setValues] = useState<ContactValues>(
    initial ?? { name: "", email: "", phone: "", address: "", notes: "", tags: "", contactPerson: "" }
  );
  const [pending, start] = useTransition();
  const isEdit = !!initial?.id;

  const set = (k: keyof ContactValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = () =>
    start(async () => {
      const payload = {
        ...(isEdit ? { id: initial!.id } : {}),
        name: values.name, email: values.email, phone: values.phone,
        address: values.address, notes: values.notes,
        ...(kind === "customer"
          ? { tags: (values.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean) }
          : { contactPerson: values.contactPerson }),
      };
      const action = kind === "customer"
        ? (isEdit ? updateCustomer : createCustomer)
        : (isEdit ? updateSupplier : createSupplier);
      const r = await action(payload);
      if (r.success) {
        toast.success(`${kind === "customer" ? "Customer" : "Supplier"} ${isEdit ? "updated" : "created"}.`);
        setOpen(false); router.refresh();
      } else toast.error(r.error);
    });

  return (
    <Sheet open={actualOpen} onOpenChange={setOpen}>
      {!controlled && <SheetTrigger asChild><Button>{label}</Button></SheetTrigger>}
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{isEdit ? `Edit ${initial!.name}` : `New ${kind}`}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" value={values.name} onChange={set("name")} autoFocus />
          </div>
          {kind === "supplier" && (
            <div className="space-y-1.5">
              <Label htmlFor="c-person">Contact person</Label>
              <Input id="c-person" value={values.contactPerson} onChange={set("contactPerson")} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" value={values.phone} onChange={set("phone")} placeholder="+212…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" value={values.email} onChange={set("email")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-address">Address</Label>
            <Input id="c-address" value={values.address} onChange={set("address")} />
          </div>
          {kind === "customer" && (
            <div className="space-y-1.5">
              <Label htmlFor="c-tags">Tags</Label>
              <Input id="c-tags" value={values.tags} onChange={set("tags")} placeholder="vip, wholesale" />
              <p className="text-xs text-muted-foreground">Comma-separated.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea id="c-notes" value={values.notes} onChange={set("notes")} rows={3} />
          </div>
        </div>
        <SheetFooter className="border-t px-6 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !values.name.trim()}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------- CSV import dialog (preview -> commit) ----------
export function ContactImportDialog({ kind }: { kind: "customer" | "supplier" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<{ row: number; name: string; status: string; error?: string }[] | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const doPreview = (text: string) =>
    start(async () => {
      const action = kind === "customer" ? previewCustomerImport : previewSupplierImport;
      const r = await action({ csvText: text });
      if (r.success) { setCsvText(text); setPreview(r.data); }
      else toast.error(r.error);
    });

  const doCommit = () =>
    start(async () => {
      const action = kind === "customer" ? commitCustomerImport : commitSupplierImport;
      const r = await action({ csvText });
      if (r.success) {
        toast.success(`Imported ${r.data.imported} ${kind}(s), skipped ${r.data.skipped}.`);
        setOpen(false); setPreview(null); router.refresh();
      } else toast.error(r.error);
    });

  const okCount = preview?.filter((p) => p.status === "ok").length ?? 0;
  const tone: Record<string, string> = { ok: "text-success", duplicate: "text-warning", error: "text-destructive" };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPreview(null); }}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="size-4" aria-hidden /> Import
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Import {kind}s from CSV</DialogTitle></DialogHeader>
        {!preview ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-sm text-muted-foreground hover:border-primary/50 hover:bg-accent/30"
          >
            <FileUp className="size-5" aria-hidden />
            Choose a CSV file
            <span className="text-xs">Header: name,phone,email,address,notes{kind === "customer" ? ",tags" : ""}</span>
          </button>
        ) : (
          <>
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Row</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((p) => (
                    <TableRow key={p.row}>
                      <TableCell className="tabular">{p.row}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${tone[p.status]}`}>
                          {p.status}{p.error ? ` — ${p.error}` : ""}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-sm text-muted-foreground">{okCount} of {preview.length} row(s) will be imported (duplicates and errors are skipped).</p>
          </>
        )}
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) doPreview(await f.text()); e.target.value = ""; }} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          {preview && (
            <Button onClick={doCommit} disabled={pending || okCount === 0}>
              {pending ? "Importing…" : `Import ${okCount} row(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Export menu ----------
export function ContactExportMenu({ type }: { type: "customers" | "suppliers" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline"><Download className="size-4" aria-hidden /> Export</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["csv", "xlsx", "pdf"] as const).map((f) => (
          <DropdownMenuItem key={f} asChild>
            <a href={`/api/contacts/export?type=${type}&format=${f}`} download>{f.toUpperCase()}</a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------- Activity timeline ----------
const TIMELINE_ICONS = {
  sale: ShoppingBag, return: RotateCcw, payment: Banknote,
  void: Ban, purchase: Truck, receipt: PackageCheck,
} as const;

export function ActivityTimeline({ events, currency }: {
  events: { type: keyof typeof TIMELINE_ICONS; at: string; label: string; amount: number }[];
  currency: string;
}) {
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l pl-6">
      {events.map((e, i) => {
        const Icon = TIMELINE_ICONS[e.type];
        return (
          <li key={i} className="relative">
            <span className="absolute -left-[31px] flex size-5 items-center justify-center rounded-full border bg-card">
              <Icon className="size-3 text-muted-foreground" aria-hidden />
            </span>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm">{e.label}</p>
              {e.amount !== 0 && (
                <Badge variant="secondary" className={`tabular shrink-0 ${e.amount < 0 ? "text-destructive" : ""}`}>
                  {e.amount.toFixed(2)} {currency}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</p>
          </li>
        );
      })}
    </ol>
  );
}
