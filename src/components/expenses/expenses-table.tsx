"use client";

import { useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Paperclip, Repeat, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { createExpense, updateExpense, deleteExpense, restoreExpense } from "@/actions/expenses";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EmptyState } from "@/components/shared/page-primitives";
import { SearchInput, DeleteDialog } from "@/components/shared/interactive";

const CATEGORIES = ["RENT", "UTILITIES", "SALARIES", "MARKETING", "SUPPLIES", "TRANSPORT", "MAINTENANCE", "TAXES", "INSURANCE", "OTHER"] as const;

export interface ExpenseRow {
  id: string; title: string; category: string; vendor: string | null;
  amount: number; taxAmount: number; date: string;
  paymentMethod: string | null; isRecurring: boolean; recurrenceInterval: string | null;
  attachments: { url: string; name: string }[]; notes: string | null;
}

// ---------- Table ----------
export function ExpensesTable({ expenses, currency, canManage, trashView, businessId }: {
  expenses: ExpenseRow[]; currency: string; canManage: boolean; trashView: boolean; businessId: string;
}) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ExpenseRow | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  if (expenses.length === 0) {
    return <EmptyState title={trashView ? "Trash is empty" : "No expenses"} description={trashView ? "Deleted expenses can be restored from here." : "Track rent, salaries and every dirham going out."} />;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Expense</TableHead><TableHead>Category</TableHead><TableHead>Vendor</TableHead>
              <TableHead>Amount</TableHead><TableHead>Date</TableHead><TableHead>Method</TableHead>
              {canManage && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((e) => (
              <TableRow key={e.id} className={canManage && !trashView ? "cursor-pointer" : undefined}
                onClick={canManage && !trashView ? () => setEditTarget(e) : undefined}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{e.title}</span>
                    {e.isRecurring && (
                      <Badge variant="outline" className="gap-1 text-primary">
                        <Repeat className="size-3" aria-hidden />{e.recurrenceInterval?.toLowerCase()}
                      </Badge>
                    )}
                    {e.attachments.length > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Paperclip className="size-3" aria-hidden />{e.attachments.length}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell><Badge variant="secondary">{e.category.toLowerCase()}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{e.vendor ?? "—"}</TableCell>
                <TableCell className="tabular font-semibold">
                  {formatMoney(e.amount, currency)}
                  {e.taxAmount > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">+{formatMoney(e.taxAmount, currency)} tax</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(e.date).toLocaleDateString()}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.paymentMethod?.replace("_", " ").toLowerCase() ?? "—"}</TableCell>
                {canManage && (
                  <TableCell onClick={(ev) => ev.stopPropagation()}>
                    {trashView ? (
                      <Button variant="ghost" size="icon" aria-label="Restore expense"
                        onClick={() => start(async () => {
                          const r = await restoreExpense(e.id);
                          if (r.success) {
                            toast.success("Expense restored.");
                            router.refresh();
                          } else {
                            toast.error(r.error);
                          }
                        })}>
                        <RotateCcw className="size-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" aria-label="Delete expense" onClick={() => setDeleteTarget(e.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        resourceName="expense"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const r = await deleteExpense(deleteTarget);
          if (r.success) {
            toast.success("Expense moved to trash.");
          } else {
            toast.error(r.error);
          }
          setDeleteTarget(null); router.refresh();
        }}
      />
      {editTarget && (
        <ExpenseDrawerTrigger expense={editTarget} open onOpenChange={(o) => !o && setEditTarget(null)} businessId={businessId} />
      )}
    </>
  );
}

// ---------- Toolbar ----------
export function ExpensesToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trashView = searchParams.get("deleted") === "true";
  const recurringView = searchParams.get("recurring") === "true";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") params.delete(key); else params.set(key, value);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchInput placeholder="Search expenses…" />
      <Select value={searchParams.get("category") ?? "all"} onValueChange={(v) => setParam("category", v)}>
        <SelectTrigger className="w-36" aria-label="Filter by category"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.toLowerCase()}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="date" className="w-36" aria-label="From date"
        defaultValue={searchParams.get("from") ?? ""} onChange={(e) => setParam("from", e.target.value || "all")} />
      <Input type="date" className="w-36" aria-label="To date"
        defaultValue={searchParams.get("to") ?? ""} onChange={(e) => setParam("to", e.target.value || "all")} />
      <div className="ml-auto flex gap-1">
        <Button variant={recurringView ? "secondary" : "ghost"} size="sm"
          onClick={() => setParam("recurring", recurringView ? "all" : "true")}>
          <Repeat className="size-4" aria-hidden /> Recurring
        </Button>
        <Button variant={trashView ? "secondary" : "ghost"} size="sm"
          onClick={() => setParam("deleted", trashView ? "all" : "true")}>
          {trashView ? <><Undo2 className="size-4" aria-hidden /> Back</> : <><Trash2 className="size-4" aria-hidden /> Trash</>}
        </Button>
      </div>
    </div>
  );
}

// ---------- Drawer (create/edit) ----------
export function ExpenseDrawerTrigger({ expense, label, open, onOpenChange, businessId }: {
  expense?: ExpenseRow; label?: ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void; businessId: string;
}) {
  const isEdit = !!expense;
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = controlled ? open : internalOpen;
  const setOpen = controlled ? onOpenChange! : setInternalOpen;
  const router = useRouter();
  const [pending, start] = useTransition();

  const [form, setForm] = useState({
    title: expense?.title ?? "",
    category: expense?.category ?? "OTHER",
    amount: expense?.amount ?? 0,
    taxAmount: expense?.taxAmount ?? 0,
    date: (expense?.date ?? new Date().toISOString()).slice(0, 10),
    paymentMethod: expense?.paymentMethod ?? "",
    notes: expense?.notes ?? "",
    isRecurring: expense?.isRecurring ?? false,
    recurrenceInterval: expense?.recurrenceInterval ?? "MONTHLY",
  });
  const [attachments, setAttachments] = useState(expense?.attachments.map((a) => ({ ...a, path: "", mimeType: "" })) ?? []);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (files: FileList) => {
    setUploading(true);
    const supabase = createClient();
    for (const file of Array.from(files).slice(0, 5 - attachments.length)) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name}: over 5 MB.`); continue; }
      if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
        toast.error(`${file.name}: images or PDF only.`); continue;
      }
      // Tenant-scoped path — required by the storage RLS policy (see
      // prisma/storage-policies.sql), which authorizes writes/reads by
      // the first path segment matching the caller's businessId.
      const path = `${businessId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { error } = await supabase.storage.from("receipts").upload(path, file);
      if (error) toast.error(`${file.name}: upload failed.`);
      else setAttachments((a) => [...a, {
        url: supabase.storage.from("receipts").getPublicUrl(path).data.publicUrl,
        path, name: file.name, mimeType: file.type,
      }]);
    }
    setUploading(false);
  };

  const submit = () =>
    start(async () => {
      const payload = {
        ...form,
        paymentMethod: form.paymentMethod || undefined,
        notes: form.notes || undefined,
        recurrenceInterval: form.isRecurring ? form.recurrenceInterval : undefined,
        attachments: attachments.filter((a) => a.path), // only new/complete refs
      };
      const r = isEdit ? await updateExpense({ ...payload, id: expense.id }) : await createExpense(payload);
      if (r.success) {
        toast.success(isEdit ? "Expense updated." : form.isRecurring ? "Recurring expense created — instances generate automatically." : "Expense added.");
        setOpen(false); router.refresh();
      } else toast.error(r.error);
    });

  return (
    <Sheet open={actualOpen} onOpenChange={setOpen}>
      {!controlled && <SheetTrigger asChild><Button>{label}</Button></SheetTrigger>}
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{isEdit ? "Edit expense" : "Add expense"}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="expTitle">Title</Label>
            <Input id="expTitle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Shop rent — July" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.toLowerCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expDate">Date</Label>
              <Input id="expDate" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="expAmount">Amount</Label>
              <Input id="expAmount" type="number" step="0.01" min="0" value={form.amount || ""}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expTax">Tax amount</Label>
              <Input id="expTax" type="number" step="0.01" min="0" value={form.taxAmount || ""}
                onChange={(e) => setForm({ ...form, taxAmount: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={form.paymentMethod || "none"} onValueChange={(v) => setForm({ ...form, paymentMethod: v === "none" ? "" : v })}>
              <SelectTrigger aria-label="Payment method"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Recurring */}
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <Label htmlFor="expRecurring">Recurring</Label>
              <p className="text-xs text-muted-foreground">Auto-generate this expense on a schedule.</p>
            </div>
            <Switch id="expRecurring" checked={form.isRecurring} onCheckedChange={(v) => setForm({ ...form, isRecurring: v })} />
          </div>
          {form.isRecurring && (
            <Select value={form.recurrenceInterval} onValueChange={(v) => setForm({ ...form, recurrenceInterval: v })}>
              <SelectTrigger aria-label="Repeat interval"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                <SelectItem value="YEARLY">Yearly</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Attachments */}
          <div className="space-y-1.5">
            <Label>Receipts (images or PDF, max 5)</Label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground hover:border-primary/50 hover:bg-accent/30">
              <Paperclip className="size-4" aria-hidden />
              {uploading ? "Uploading…" : "Add receipt files"}
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only"
                aria-label="Upload receipts"
                onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ""; }} />
            </label>
            {attachments.length > 0 && (
              <ul className="space-y-1">
                {attachments.map((a, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm">
                    <a href={a.url} target="_blank" className="truncate text-primary hover:underline">{a.name}</a>
                    <button onClick={() => setAttachments((arr) => arr.filter((_, ai) => ai !== i))}
                      aria-label={`Remove ${a.name}`} className="text-muted-foreground hover:text-destructive">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes…" rows={2} aria-label="Notes" />
        </div>
        <SheetFooter className="border-t px-6 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !form.title.trim() || form.amount <= 0}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
