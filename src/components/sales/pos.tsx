"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Banknote, CreditCard, Landmark, Loader2, Minus, PackageSearch, Plus, ScanBarcode, Trash2, User, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { searchPosProducts, searchCustomers, createSale } from "@/actions/sales";
import { computeTotals, computeChange, round2 } from "@/lib/sale-math";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ReceiptDialog } from "@/components/sales/receipt";

/* =====================================================
   POS — client-side till.
   Keyboard shortcuts:  F2 search · F4 customer · F8 discount
                        F9 pay · Esc clear line focus
   Barcode scanners type + Enter into the search box (keyboard
   wedge) — an exact barcode match adds to cart instantly.
   ===================================================== */

interface PosProduct { id: string; name: string; sku: string | null; barcode: string | null; sellingPrice: number; quantity: number; imageUrl: string | null }
interface CartItem extends PosProduct { cartQty: number; unitPrice: number; discountAmount: number }
interface PosCustomer { id: string; name: string; storeCredit: number; outstandingBalance: number }
type Payment = { method: "CASH" | "CARD" | "BANK_TRANSFER" | "STORE_CREDIT"; amount: number };

const money = (n: number, c: string) => `${n.toFixed(2)} ${c}`;

export function Pos({ currency, defaultTaxRate, canOverridePrice }: {
  currency: string; defaultTaxRate: number; canOverridePrice: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(defaultTaxRate);
  const [notes, setNotes] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ saleNumber: number; invoiceNumber: number | null; saleId: string; change: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<string>(crypto.randomUUID()); // idempotency key per sale

  const totals = useMemo(
    () => computeTotals(cart.map((i) => ({ quantity: i.cartQty, unitPrice: i.unitPrice, discountAmount: i.discountAmount })), globalDiscount, taxRate),
    [cart, globalDiscount, taxRate]
  );

  // ---------- search (debounced; exact barcode auto-adds) ----------
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchPosProducts({ q: query.trim() });
      setSearching(false);
      if (!r.success) return;
      if (r.data.exact && r.data.products[0]) {
        addToCart(r.data.products[0]);   // scanner flow: beep -> in cart
        setQuery(""); setResults([]);
        return;
      }
      setResults(r.data.products);
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const addToCart = useCallback((p: PosProduct) => {
    setCart((prev) => {
      const found = prev.find((i) => i.id === p.id);
      if (found) return prev.map((i) => (i.id === p.id ? { ...i, cartQty: i.cartQty + 1 } : i));
      return [...prev, { ...p, cartQty: 1, unitPrice: p.sellingPrice, discountAmount: 0 }];
    });
  }, []);

  const updateItem = (id: string, patch: Partial<CartItem>) =>
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const removeItem = (id: string) => setCart((prev) => prev.filter((i) => i.id !== id));

  const resetSale = () => {
    setCart([]); setCustomer(null); setGlobalDiscount(0); setTaxRate(defaultTaxRate);
    setNotes(""); setQuery(""); setResults([]);
    clientRef.current = crypto.randomUUID(); // NEW idempotency key for the next sale
  };

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F4") { e.preventDefault(); setCustomerOpen(true); }
      if (e.key === "F9" && cart.length > 0) { e.preventDefault(); setPayOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart.length]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* ---------- LEFT: search + results ---------- */}
      <div className="lg:col-span-3">
        <div className="relative">
          <ScanBarcode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Scan barcode or search…  (F2)"
            aria-label="Search products or scan barcode"
            className="h-12 pl-10 text-base shadow-soft"
            autoFocus
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => { addToCart(p); setQuery(""); setResults([]); searchRef.current?.focus(); }}
              disabled={p.quantity <= 0}
              className="flex min-h-[76px] items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-soft transition-shadow hover:shadow-lifted disabled:opacity-50"
            >
              {p.imageUrl ? (
                <Image src={p.imageUrl} alt="" width={40} height={40} className="size-10 rounded-lg border object-cover" />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <PackageSearch className="size-4 text-muted-foreground" aria-hidden />
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="tabular block text-xs text-muted-foreground">
                  {money(p.sellingPrice, currency)} · {p.quantity} in stock
                </span>
              </span>
            </button>
          ))}
          {query && !searching && results.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No products found.</p>
          )}
        </div>
      </div>

      {/* ---------- RIGHT: cart ---------- */}
      <Card className="shadow-soft lg:col-span-2">
        <CardContent className="flex h-full flex-col p-4">
          {/* Customer */}
          <Button variant="outline" className="mb-3 justify-start" onClick={() => setCustomerOpen(true)}>
            <User className="size-4 text-primary" aria-hidden />
            {customer ? customer.name : "Walk-in customer (F4)"}
            {customer && customer.storeCredit > 0 && (
              <Badge variant="secondary" className="ml-auto text-success">credit {money(customer.storeCredit, currency)}</Badge>
            )}
            {customer && <X className="size-3.5 opacity-60" onClick={(e) => { e.stopPropagation(); setCustomer(null); }} aria-label="Remove customer" />}
          </Button>

          {/* Lines */}
          <div className="flex-1 space-y-2 overflow-y-auto" aria-live="polite">
            {cart.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Cart is empty — scan or search to add.</p>}
            {cart.map((item) => (
              <div key={item.id} className="rounded-lg border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</p>
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Remove ${item.name}`} onClick={() => removeItem(item.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {/* qty stepper — 44px touch targets */}
                  <div className="flex items-center rounded-lg border">
                    <Button variant="ghost" size="icon" className="size-9" aria-label="Decrease quantity"
                      onClick={() => item.cartQty > 1 ? updateItem(item.id, { cartQty: item.cartQty - 1 }) : removeItem(item.id)}>
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="tabular w-8 text-center text-sm font-medium">{item.cartQty}</span>
                    <Button variant="ghost" size="icon" className="size-9" aria-label="Increase quantity"
                      onClick={() => {
                        if (item.cartQty >= item.quantity) toast.warning(`Only ${item.quantity} in stock.`);
                        updateItem(item.id, { cartQty: item.cartQty + 1 });
                      }}>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                  {/* price (override if permitted) */}
                  <Input
                    type="number" step="0.01" min="0"
                    value={item.unitPrice}
                    disabled={!canOverridePrice}
                    aria-label={`Unit price for ${item.name}`}
                    onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value) || 0 })}
                    className="tabular h-9 w-24 text-right"
                  />
                  {/* line discount */}
                  <Input
                    type="number" step="0.01" min="0" placeholder="disc."
                    value={item.discountAmount || ""}
                    aria-label={`Discount for ${item.name}`}
                    onChange={(e) => updateItem(item.id, { discountAmount: Number(e.target.value) || 0 })}
                    className="tabular h-9 w-20 text-right"
                  />
                  <span className="tabular ml-auto text-sm font-semibold">
                    {money(round2(item.cartQty * item.unitPrice - item.discountAmount), currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-3 space-y-1.5 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span className="tabular">{money(totals.subtotal, currency)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Discount (F8)</span>
              <Input type="number" step="0.01" min="0" value={globalDiscount || ""} placeholder="0.00"
                aria-label="Global discount"
                onChange={(e) => setGlobalDiscount(Number(e.target.value) || 0)}
                className="tabular h-8 w-24 text-right" />
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Tax %</span>
              <Input type="number" step="0.01" min="0" max="100" value={taxRate}
                aria-label="Tax rate"
                onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                className="tabular h-8 w-24 text-right" />
            </div>
            <div className="flex justify-between pt-1 text-lg font-semibold">
              <span>Total</span><span className="tabular">{money(totals.total, currency)}</span>
            </div>
          </div>

          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes…" rows={1} className="mt-2 resize-none" aria-label="Sale notes" />

          <div className="mt-3 grid grid-cols-3 gap-2">
            <SaveDraftButton cart={cart} customer={customer} globalDiscount={globalDiscount} taxRate={taxRate} notes={notes} clientRef={clientRef} onSaved={resetSale} />
            <Button className="col-span-2 h-12 text-base" disabled={cart.length === 0} onClick={() => setPayOpen(true)}>
              Pay {money(totals.total, currency)} (F9)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---------- dialogs ---------- */}
      <CustomerDialog open={customerOpen} onOpenChange={setCustomerOpen} currency={currency} onSelect={(c) => { setCustomer(c); setCustomerOpen(false); }} />
      <PaymentDialog
        open={payOpen} onOpenChange={setPayOpen}
        total={totals.total} currency={currency} customer={customer}
        onConfirm={async (payments) => {
          const result = await createSale({
            clientRef: clientRef.current,
            customerId: customer?.id,
            status: "COMPLETED",
            items: cart.map((i) => ({
              productId: i.id, quantity: i.cartQty, discountAmount: i.discountAmount,
              ...(canOverridePrice && i.unitPrice !== i.sellingPrice ? { unitPriceOverride: i.unitPrice } : {}),
            })),
            globalDiscount, taxRate, notes: notes || undefined, payments,
          });
          if (result.success) {
            const change = computeChange(payments, totals.total);
            setPayOpen(false);
            setReceipt({ saleNumber: result.data.saleNumber, invoiceNumber: result.data.invoiceNumber, saleId: result.data.id, change });
            resetSale();
          } else {
            toast.error(result.error);
          }
        }}
      />
      {receipt && <ReceiptDialog {...receipt} currency={currency} onClose={() => setReceipt(null)} />}
    </div>
  );
}

// ---------- Save as draft (suspend) ----------
function SaveDraftButton({ cart, customer, globalDiscount, taxRate, notes, clientRef, onSaved }: {
  cart: CartItem[]; customer: PosCustomer | null; globalDiscount: number; taxRate: number; notes: string;
  clientRef: React.MutableRefObject<string>; onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" className="h-12" disabled={cart.length === 0 || pending}
      onClick={() => start(async () => {
        const r = await createSale({
          clientRef: clientRef.current, customerId: customer?.id, status: "DRAFT",
          items: cart.map((i) => ({ productId: i.id, quantity: i.cartQty, discountAmount: i.discountAmount })),
          globalDiscount, taxRate, notes: notes || undefined, payments: [],
        });
        if (r.success) { toast.success(`Sale suspended as draft #${r.data.saleNumber}. Resume it from Sales.`); onSaved(); }
        else toast.error(r.error);
      })}>
      {pending ? "…" : "Suspend"}
    </Button>
  );
}

// ---------- Customer picker ----------
function CustomerDialog({ open, onOpenChange, onSelect, currency }: {
  open: boolean; onOpenChange: (o: boolean) => void; onSelect: (c: PosCustomer) => void; currency: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PosCustomer[]>([]);
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await searchCustomers(q.trim());
      if (r.success) setResults(r.data);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Select customer</DialogTitle></DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone…" autoFocus aria-label="Search customers" />
        <ul className="max-h-64 divide-y overflow-y-auto">
          {results.map((c) => (
            <li key={c.id}>
              <button className="flex w-full items-center justify-between px-2 py-2.5 text-left text-sm hover:bg-secondary" onClick={() => onSelect(c)}>
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.storeCredit > 0 && <span className="text-success">credit {c.storeCredit.toFixed(2)} {currency}</span>}
                  {c.outstandingBalance > 0 && <span className="ml-2 text-warning">owes {c.outstandingBalance.toFixed(2)} {currency}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Payment dialog (mixed payments) ----------
const METHODS = [
  { key: "CASH", label: "Cash", icon: Banknote },
  { key: "CARD", label: "Card", icon: CreditCard },
  { key: "BANK_TRANSFER", label: "Transfer", icon: Landmark },
  { key: "STORE_CREDIT", label: "Credit", icon: Wallet },
] as const;

function PaymentDialog({ open, onOpenChange, total, currency, customer, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; total: number; currency: string;
  customer: PosCustomer | null;
  onConfirm: (payments: Payment[]) => Promise<void>;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => { if (open) setPayments([{ method: "CASH", amount: total }]); }, [open, total]);

  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const remaining = round2(total - paid);
  const change = computeChange(payments, total);
  const canComplete = remaining <= 0 || !!customer; // unpaid remainder needs a customer

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="tabular">Payment — {total.toFixed(2)} {currency}</DialogTitle></DialogHeader>

        <div className="space-y-2">
          {payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="grid flex-1 grid-cols-4 gap-1">
                {METHODS.map((m) => (
                  <Button key={m.key} type="button" size="sm"
                    variant={p.method === m.key ? "default" : "outline"}
                    disabled={m.key === "STORE_CREDIT" && !customer}
                    onClick={() => setPayments((prev) => prev.map((x, xi) => xi === i ? { ...x, method: m.key } : x))}>
                    <m.icon className="size-3.5" aria-hidden /> {m.label}
                  </Button>
                ))}
              </div>
              <Input type="number" step="0.01" min="0" value={p.amount || ""} aria-label="Payment amount"
                onChange={(e) => setPayments((prev) => prev.map((x, xi) => xi === i ? { ...x, amount: Number(e.target.value) || 0 } : x))}
                className="tabular h-9 w-28 text-right" />
              {payments.length > 1 && (
                <Button variant="ghost" size="icon" className="size-8" aria-label="Remove payment line"
                  onClick={() => setPayments((prev) => prev.filter((_, xi) => xi !== i))}>
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          {payments.length < 4 && (
            <Button variant="ghost" size="sm" onClick={() => setPayments((p) => [...p, { method: "CARD", amount: Math.max(0, remaining) }])}>
              <Plus className="size-3.5" aria-hidden /> Split payment
            </Button>
          )}
        </div>

        <div className="space-y-1 rounded-lg bg-secondary p-3 text-sm">
          <div className="flex justify-between"><span>Paid</span><span className="tabular">{paid.toFixed(2)} {currency}</span></div>
          {remaining > 0 && (
            <div className="flex justify-between text-warning">
              <span>{customer ? "On customer account" : "Remaining (needs a customer)"}</span>
              <span className="tabular">{remaining.toFixed(2)} {currency}</span>
            </div>
          )}
          {change > 0 && (
            <div className="flex justify-between font-medium text-success">
              <span>Change</span><span className="tabular">{change.toFixed(2)} {currency}</span>
            </div>
          )}
          {customer && customer.storeCredit > 0 && payments.some((p) => p.method === "STORE_CREDIT") && (
            <p className="text-xs text-muted-foreground">Available store credit: {customer.storeCredit.toFixed(2)} {currency}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button disabled={pending || !canComplete || paid <= 0}
            onClick={() => start(async () => onConfirm(payments.filter((p) => p.amount > 0)))}>
            {pending ? "Completing…" : "Complete sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
