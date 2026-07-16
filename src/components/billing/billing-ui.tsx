"use client";

import { useState, useTransition } from "react";
import { Check, CreditCard, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  startCheckout, openBillingPortal, changePlan, cancelSubscription, resumeSubscription,
} from "@/actions/billing-admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/interactive";

const FEATURE_LABELS: Record<string, string> = {
  aiAssistant: "AI Assistant", reports: "Reports & dashboards", multiBusiness: "Multiple businesses",
  advancedAnalytics: "Advanced analytics", unlimitedProducts: "Unlimited products",
  unlimitedCustomers: "Unlimited customers", unlimitedSuppliers: "Unlimited suppliers",
  csvExport: "CSV export", excelExport: "Excel export", pdfExport: "PDF export",
  prioritySupport: "Priority support",
};

export function BillingActions({ plan, hasStripeSubscription, cancelAtPeriodEnd }: {
  plan: string; hasStripeSubscription: boolean; cancelAtPeriodEnd: boolean;
}) {
  const [pending, start] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      {hasStripeSubscription && (
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const r = await openBillingPortal();
          if (r && !r.success) toast.error(r.error);
        })}>
          <CreditCard className="size-4" aria-hidden /> Billing portal
        </Button>
      )}
      {hasStripeSubscription && plan !== "FREE" && (
        cancelAtPeriodEnd ? (
          <Button variant="outline" disabled={pending} onClick={() => start(async () => {
            const r = await resumeSubscription();
            r.success ? toast.success("Subscription resumed.") : toast.error(r.error);
          })}>
            <RotateCcw className="size-4" aria-hidden /> Resume subscription
          </Button>
        ) : (
          <>
            <Button variant="ghost" className="text-destructive" disabled={pending} onClick={() => setCancelOpen(true)}>
              <XCircle className="size-4" aria-hidden /> Cancel
            </Button>
            <ConfirmDialog
              open={cancelOpen} onOpenChange={setCancelOpen}
              title="Cancel your subscription?"
              description="You keep full access until the end of the current period, then move to the Free plan. You can resume any time before then."
              confirmLabel="Cancel subscription" destructive
              onConfirm={async () => {
                const r = await cancelSubscription();
                r.success ? toast.success("Cancellation scheduled for the end of the period.") : toast.error(r.error);
              }}
            />
          </>
        )
      )}
    </div>
  );
}

interface PlanCard {
  id: string; name: string; monthlyPrice: number; yearlyPrice: number;
  trialDays: number; features: string[];
}

export function PlanCards({ plans, currentPlan, hasStripeSubscription }: {
  plans: PlanCard[]; currentPlan: string; hasStripeSubscription: boolean;
}) {
  const [yearly, setYearly] = useState(false);
  const [pending, start] = useTransition();

  const select = (planId: string) => start(async () => {
    const payload = { plan: planId, interval: yearly ? "YEARLY" : "MONTHLY" };
    // Existing Stripe subscription -> in-place change with proration.
    // Otherwise -> Checkout (with trial).
    const r = hasStripeSubscription ? await changePlan(payload) : await startCheckout(payload);
    if (r && !r.success) toast.error(r.error);
    else if (r?.success) toast.success("Plan updated — proration applied by Stripe.");
  });

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Label htmlFor="yearly" className="text-sm text-muted-foreground">Monthly</Label>
        <Switch id="yearly" checked={yearly} onCheckedChange={setYearly} aria-label="Yearly billing" />
        <Label htmlFor="yearly" className="text-sm">
          Yearly <Badge variant="secondary" className="ml-1 text-success">2 months free</Badge>
        </Label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const price = yearly ? plan.yearlyPrice : plan.monthlyPrice;
          return (
            <Card key={plan.id} className={`shadow-soft ${plan.id === "PRO" ? "border-primary/40 shadow-lifted" : ""}`}>
              <CardContent className="flex h-full flex-col p-5">
                <div className="flex items-center justify-between">
                  <h3 className="display-tight text-lg font-semibold">{plan.name}</h3>
                  {plan.id === "PRO" && <Badge>Popular</Badge>}
                </div>
                <p className="tabular mt-2 text-3xl font-semibold">
                  ${price}
                  <span className="text-sm font-normal text-muted-foreground">/{yearly ? "yr" : "mo"}</span>
                </p>
                {plan.trialDays > 0 && !isCurrent && (
                  <p className="text-xs text-muted-foreground">{plan.trialDays}-day free trial</p>
                )}
                <ul className="mt-4 flex-1 space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="size-3.5 text-primary" aria-hidden /> {FEATURE_LABELS[f] ?? f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-5"
                  variant={isCurrent ? "outline" : plan.id === "PRO" ? "default" : "outline"}
                  disabled={isCurrent || pending || plan.id === "FREE"}
                  onClick={() => select(plan.id)}
                >
                  {isCurrent ? "Current plan" : plan.id === "FREE" ? "Downgrade via cancel" : `Choose ${plan.name}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
