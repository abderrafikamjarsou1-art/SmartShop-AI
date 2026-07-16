/**
 * Sale math — PURE functions, no IO, no Prisma, no Date.now().
 *
 * DESIGN DECISION (offline-ready): every money calculation the POS and
 * the server need lives here. The POS imports it to show live totals;
 * the service imports it to compute the persisted truth. One implementation
 * = client preview and server result can never disagree, and a future
 * offline POS reuses it untouched.
 *
 * All rounding is half-up to 2 decimals at each boundary, applied in ONE
 * place (round2) so totals are reproducible.
 */

export interface CartLine {
  quantity: number;
  unitPrice: number;       // effective price (after any approved override)
  discountAmount: number;  // absolute, per line
}

export interface SaleTotals {
  subtotal: number;        // sum of line totals (after line discounts)
  globalDiscount: number;  // clamped to subtotal
  taxableBase: number;     // subtotal - globalDiscount
  taxAmount: number;
  total: number;
  lineTotals: number[];
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeLineTotal(line: CartLine): number {
  const gross = line.quantity * line.unitPrice;
  // A line discount can never push a line negative
  return round2(Math.max(0, gross - line.discountAmount));
}

export function computeTotals(lines: CartLine[], globalDiscount: number, taxRate: number): SaleTotals {
  const lineTotals = lines.map(computeLineTotal);
  const subtotal = round2(lineTotals.reduce((s, t) => s + t, 0));
  const clampedGlobal = round2(Math.min(Math.max(0, globalDiscount), subtotal));
  const taxableBase = round2(subtotal - clampedGlobal);
  const taxAmount = round2(taxableBase * (taxRate / 100));
  const total = round2(taxableBase + taxAmount);
  return { subtotal, globalDiscount: clampedGlobal, taxableBase, taxAmount, total, lineTotals };
}

/**
 * Refund for returning `returnQty` units of a line.
 *
 * DESIGN DECISION: the customer paid line net prices MINUS a proportional
 * share of the global discount PLUS proportional tax. So the fair refund is
 * the line's per-unit net price scaled by (total / subtotal) — the exact
 * effective rate they paid. Returning everything refunds exactly `total`
 * (modulo 1-cent rounding, which the service truncates against the
 * remaining refundable amount).
 */
export function computeRefund(
  lineTotal: number, lineQuantity: number, returnQty: number,
  saleSubtotal: number, saleTotal: number
): number {
  if (lineQuantity <= 0 || saleSubtotal <= 0) return 0;
  const base = (lineTotal / lineQuantity) * returnQty;
  return round2(base * (saleTotal / saleSubtotal));
}

/** PENDING / PARTIAL / PAID from amounts — one rule, used everywhere. */
export function derivePaymentStatus(amountPaid: number, total: number): "PENDING" | "PARTIAL" | "PAID" {
  if (amountPaid <= 0) return "PENDING";
  if (round2(amountPaid) >= round2(total)) return "PAID";
  return "PARTIAL";
}

/** Cash change to hand back when cash tendered exceeds what's due. */
export function computeChange(payments: { method: string; amount: number }[], total: number): number {
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const cash = payments.filter((p) => p.method === "CASH").reduce((s, p) => s + p.amount, 0);
  const over = round2(paid - total);
  return over > 0 ? Math.min(over, cash) : 0;
}
