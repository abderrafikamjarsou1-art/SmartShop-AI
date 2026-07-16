"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createExpense } from "@/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = [
  "RENT", "UTILITIES", "SALARIES", "MARKETING", "SUPPLIES",
  "TRANSPORT", "MAINTENANCE", "TAXES", "INSURANCE", "OTHER",
] as const;

const RECURRENCE = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;

/**
 * Create-expense drawer. Mirrors the product/purchase drawer pattern:
 * a single Sheet, client state, submit via the server action, revalidate
 * via router.refresh(). Enforcement (quota/plan) happens in the service.
 */
export function ExpenseDrawerTrigger({ label }: { label: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("OTHER");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER" | "">("");
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<(typeof RECURRENCE)[number]>("MONTHLY");

  const valid = title.trim().length > 0 && Number(amount) > 0;

  const reset = () => {
    setTitle(""); setCategory("OTHER"); setAmount(""); setTaxAmount("");
    setDate(new Date().toISOString().slice(0, 10)); setPaymentMethod("");
    setNotes(""); setIsRecurring(false); setRecurrenceInterval("MONTHLY");
  };

  const submit = () =>
    start(async () => {
      const r = await createExpense({
        title,
        category,
        amount: Number(amount),
        taxAmount: Number(taxAmount) || 0,
        date,
        paymentMethod: paymentMethod || undefined,
        notes: notes || undefined,
        isRecurring,
        recurrenceInterval: isRecurring ? recurrenceInterval : undefined,
      });
      if (r.success) {
        toast.success("Expense recorded.");
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button>{label}</Button></SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Add expense</SheetTitle>
          <SheetDescription>Record a business expense, optionally recurring.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="exp-title">Title</Label>
            <Input id="exp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. October rent" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as (typeof CATEGORIES)[number])}>
                <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Date</Label>
              <Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Amount</Label>
              <Input id="exp-amount" type="number" step="0.01" min="0" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="tabular" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-tax">Tax (optional)</Label>
              <Input id="exp-tax" type="number" step="0.01" min="0" value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)} placeholder="0.00" className="tabular" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={paymentMethod || undefined} onValueChange={(v) => setPaymentMethod(v as "CASH" | "CARD" | "BANK_TRANSFER")}>
              <SelectTrigger aria-label="Payment method"><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-notes">Notes</Label>
            <Textarea id="exp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <Label htmlFor="exp-recurring">Recurring expense</Label>
              <p className="text-xs text-muted-foreground">Auto-generate on a schedule.</p>
            </div>
            <Switch id="exp-recurring" checked={isRecurring} onCheckedChange={setIsRecurring} />
          </div>

          {isRecurring && (
            <div className="space-y-1.5">
              <Label>Interval</Label>
              <Select value={recurrenceInterval} onValueChange={(v) => setRecurrenceInterval(v as (typeof RECURRENCE)[number])}>
                <SelectTrigger aria-label="Recurrence interval"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE.map((r) => (
                    <SelectItem key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !valid}>{pending ? "Saving…" : "Save expense"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
