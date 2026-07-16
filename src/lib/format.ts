/** Formatting helpers shared across the app. */

/** Currency formatting. Whole units by default (MAD has no minor display here). */
export function formatMoney(amount: number, currency = "MAD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
