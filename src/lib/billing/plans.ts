/**
 * Plan catalog — the single source of truth for what each plan includes.
 * PURE config: no IO, imported by services (enforcement) AND by the
 * pricing UI (display), so marketing and enforcement can never disagree.
 */

export type Feature =
  | "aiAssistant"
  | "reports"
  | "multiBusiness"
  | "advancedAnalytics"
  | "unlimitedProducts"
  | "unlimitedCustomers"
  | "unlimitedSuppliers"
  | "csvExport"
  | "excelExport"
  | "pdfExport"
  | "prioritySupport";

export type QuotaMetric =
  | "products" | "salesPerMonth" | "invoicesPerMonth"
  | "customers" | "suppliers" | "aiRequestsPerMonth"
  | "storageBytes" | "apiCallsPerMonth";

export type PlanId = "FREE" | "PRO" | "BUSINESS";

export interface PlanDef {
  id: PlanId;
  name: string;
  monthlyPrice: number;             // display only; Stripe prices are truth
  yearlyPrice: number;
  features: ReadonlySet<Feature>;
  quotas: Record<QuotaMetric, number>;  // Infinity = unlimited
  trialDays: number;
}

const GB = 1024 * 1024 * 1024;

export const PLANS: Record<PlanId, PlanDef> = {
  FREE: {
    id: "FREE", name: "Free", monthlyPrice: 0, yearlyPrice: 0, trialDays: 0,
    features: new Set<Feature>(["csvExport"]),
    quotas: {
      products: 50, salesPerMonth: 200, invoicesPerMonth: 200,
      customers: 100, suppliers: 10, aiRequestsPerMonth: 0,
      storageBytes: 1 * GB, apiCallsPerMonth: 1_000,
    },
  },
  PRO: {
    id: "PRO", name: "Pro", monthlyPrice: 29, yearlyPrice: 290, trialDays: 14,
    features: new Set<Feature>([
      "aiAssistant", "reports", "csvExport", "excelExport", "pdfExport",
    ]),
    quotas: {
      products: 2_000, salesPerMonth: 5_000, invoicesPerMonth: 5_000,
      customers: 5_000, suppliers: 200, aiRequestsPerMonth: 500,
      storageBytes: 20 * GB, apiCallsPerMonth: 50_000,
    },
  },
  BUSINESS: {
    id: "BUSINESS", name: "Business", monthlyPrice: 79, yearlyPrice: 790, trialDays: 14,
    features: new Set<Feature>([
      "aiAssistant", "reports", "multiBusiness", "advancedAnalytics",
      "unlimitedProducts", "unlimitedCustomers", "unlimitedSuppliers",
      "csvExport", "excelExport", "pdfExport", "prioritySupport",
    ]),
    quotas: {
      products: Infinity, salesPerMonth: Infinity, invoicesPerMonth: Infinity,
      customers: Infinity, suppliers: Infinity, aiRequestsPerMonth: 5_000,
      storageBytes: 200 * GB, apiCallsPerMonth: 1_000_000,
    },
  },
};

/** Stripe price ids come from env so test/live modes swap cleanly. */
export function stripePriceId(plan: Exclude<PlanId, "FREE">, interval: "MONTHLY" | "YEARLY"): string {
  const key = `STRIPE_PRICE_${plan}_${interval}`;
  const value = process.env[key];
  if (!value) throw new Error(`Missing env ${key}`);
  return value;
}

/** Reverse lookup: which plan/interval does a Stripe price belong to? */
export function planFromPriceId(priceId: string): { plan: PlanId; interval: "MONTHLY" | "YEARLY" } | null {
  for (const plan of ["PRO", "BUSINESS"] as const) {
    for (const interval of ["MONTHLY", "YEARLY"] as const) {
      if (process.env[`STRIPE_PRICE_${plan}_${interval}`] === priceId) return { plan, interval };
    }
  }
  return null;
}
