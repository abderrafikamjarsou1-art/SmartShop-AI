import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { entitlementService } from "@/services/entitlement-service";
import { PLANS, type PlanId, type QuotaMetric } from "@/lib/billing/plans";
import { PageHeader, SectionHeader } from "@/components/shared/page-primitives";
import { BillingActions, PlanCards } from "@/components/billing/billing-ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Billing" };

const METRIC_LABELS: Record<string, string> = {
  products: "Products", customers: "Customers", suppliers: "Suppliers",
  salesPerMonth: "Sales this month", invoicesPerMonth: "Invoices this month",
  aiRequestsPerMonth: "AI requests this month", storageBytes: "Storage",
};

function formatUsage(metric: string, value: number) {
  if (metric === "storageBytes") return `${(value / 1024 ** 3).toFixed(2)} GB`;
  return String(value);
}

export default async function BillingPage() {
  const ctx = await requireRole("billing:manage");
  const [{ plan, usage }, subscription] = await Promise.all([
    entitlementService.getEntitlements(ctx),
    prisma.subscription.findUnique({ where: { businessId: ctx.businessId } }),
  ]);
  const def = PLANS[plan];

  return (
    <>
      <PageHeader title="Billing" description="Your plan, usage and invoices." />

      {/* Current plan */}
      <Card className="mb-6 shadow-soft">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="display-tight text-xl font-semibold">{def.name} plan</h2>
              {subscription?.status === "TRIALING" && subscription.trialEndsAt && (
                <Badge variant="secondary" className="text-primary">
                  Trial until {subscription.trialEndsAt.toLocaleDateString()}
                </Badge>
              )}
              {subscription?.status === "PAST_DUE" && (
                <Badge variant="outline" className="text-destructive">Payment failed — retrying</Badge>
              )}
              {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
                <Badge variant="outline" className="text-warning">
                  Cancels {subscription.currentPeriodEnd.toLocaleDateString()}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan === "FREE"
                ? "Upgrade to unlock the AI assistant, reports and higher limits."
                : subscription?.currentPeriodEnd
                  ? `Renews ${subscription.currentPeriodEnd.toLocaleDateString()}`
                  : ""}
            </p>
          </div>
          <BillingActions
            plan={plan}
            hasStripeSubscription={!!subscription?.stripeSubscriptionId}
            cancelAtPeriodEnd={!!subscription?.cancelAtPeriodEnd}
          />
        </CardContent>
      </Card>

      {/* Usage */}
      <Card className="mb-6 shadow-soft">
        <CardContent className="p-5">
          <SectionHeader title="Usage" description={`Limits on the ${def.name} plan`} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(Object.entries(usage) as [QuotaMetric, { used: number; limit: number | null }][])
              .filter(([m]) => METRIC_LABELS[m])
              .map(([metric, { used, limit }]) => {
                const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                return (
                  <div key={metric}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-muted-foreground">{METRIC_LABELS[metric]}</span>
                      <span className="tabular font-medium">
                        {formatUsage(metric, used)}{limit !== null ? ` / ${formatUsage(metric, limit)}` : " · unlimited"}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar"
                      aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={METRIC_LABELS[metric]}>
                      <div className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-primary"}`}
                        style={{ width: limit !== null ? `${pct}%` : "4%" }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Plans */}
      <SectionHeader title="Plans" description="Switch any time — proration is automatic." />
      <PlanCards
        currentPlan={plan}
        hasStripeSubscription={!!subscription?.stripeSubscriptionId}
        plans={(Object.values(PLANS) as (typeof PLANS)[PlanId][]).map((p) => ({
          id: p.id, name: p.name, monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice,
          trialDays: p.trialDays, features: [...p.features],
        }))}
      />
    </>
  );
}
