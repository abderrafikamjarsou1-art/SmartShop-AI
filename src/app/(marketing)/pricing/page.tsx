import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, type PlanId, type Feature } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Pricing — SmartShop AI",
  description: "Start free. Upgrade as you grow. Transparent monthly pricing with no lock-in.",
};

const ORDER: PlanId[] = ["FREE", "PRO", "BUSINESS"];

const FEATURE_LABELS: Record<Feature, string> = {
  aiAssistant: "AI copilot",
  reports: "Advanced reports",
  multiBusiness: "Multiple businesses",
  advancedAnalytics: "Advanced analytics",
  unlimitedProducts: "Unlimited products",
  unlimitedCustomers: "Unlimited customers",
  unlimitedSuppliers: "Unlimited suppliers",
  csvExport: "CSV export",
  excelExport: "Excel export",
  pdfExport: "PDF invoices & export",
  prioritySupport: "Priority support",
};

const q = (n: number) => (n === Infinity ? "Unlimited" : n.toLocaleString("en-US"));

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="text-center">
        <h1 className="display-tight text-3xl font-bold sm:text-4xl">Simple, transparent pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Start free. Upgrade when you grow. Cancel anytime.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {ORDER.map((id) => {
          const p = PLANS[id];
          const highlighted = id === "PRO";
          return (
            <div
              key={id}
              className={`rounded-2xl border bg-card p-6 shadow-soft ${highlighted ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{p.name}</h2>
                {highlighted && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    Most popular
                  </span>
                )}
              </div>
              <p className="mt-3">
                <span className="text-3xl font-bold">${p.monthlyPrice}</span>
                <span className="text-muted-foreground">/mo</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.trialDays > 0 ? `${p.trialDays}-day free trial` : "Free forever"}
              </p>

              <Button asChild className="mt-5 w-full" variant={highlighted ? "default" : "outline"}>
                <Link href="/register">{id === "FREE" ? "Get started" : `Choose ${p.name}`}</Link>
              </Button>

              <ul className="mt-6 space-y-2.5 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{q(p.quotas.products)} products</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{q(p.quotas.salesPerMonth)} sales / month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{q(p.quotas.customers)} customers</span>
                </li>
                {[...p.features].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>{FEATURE_LABELS[f]}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Prices shown are indicative; billing is handled securely by Stripe at checkout.
      </p>
    </section>
  );
}
