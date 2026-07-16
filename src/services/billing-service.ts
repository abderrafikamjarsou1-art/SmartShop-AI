import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/billing/stripe";
import { audit } from "@/lib/audit";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { PLANS, planFromPriceId, stripePriceId, type PlanId } from "@/lib/billing/plans";
import { sendBillingEmail } from "@/lib/billing/emails";
import { logger } from "@/lib/logger";
import type { TenantContext } from "@/lib/tenant";

/**
 * Billing service.
 *
 * DESIGN DECISION — one-way sync, Stripe is the source of truth:
 * we never hand-edit plan/status locally. Every local change flows FROM
 * Stripe through syncFromStripe() (called by webhooks AND after portal
 * returns). Upgrades/downgrades/proration/cancellation are Stripe
 * operations; our DB is a read model. This kills every "local says PRO,
 * Stripe says canceled" class of bug.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export const billingService = {
  // ---------------------------------------------------------------
  // CHECKOUT — new paid subscription (with trial support)
  // ---------------------------------------------------------------
  async createCheckoutSession(ctx: TenantContext, plan: Exclude<PlanId, "FREE">, interval: "MONTHLY" | "YEARLY") {
    const sub = await prisma.subscription.findUnique({ where: { businessId: ctx.businessId } });
    if (!sub) throw new NotFoundError("Subscription");
    if (sub.stripeSubscriptionId && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status)) {
      throw new ValidationError("You already have a subscription — use 'Change plan' or the billing portal.");
    }

    // One Stripe customer per business, created lazily
    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe().customers.create({
        email: ctx.user.email,
        name: ctx.business.name,
        metadata: { businessId: ctx.businessId },
      });
      customerId = customer.id;
      await prisma.subscription.update({
        where: { businessId: ctx.businessId }, data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: stripePriceId(plan, interval), quantity: 1 }],
      subscription_data: {
        metadata: { businessId: ctx.businessId },
        ...(PLANS[plan].trialDays > 0 && sub.status !== "CANCELED"
          ? { trial_period_days: PLANS[plan].trialDays }
          : {}),
      },
      success_url: `${APP_URL}/settings/billing?checkout=success`,
      cancel_url: `${APP_URL}/settings/billing?checkout=cancelled`,
      // businessId also on the session -> checkout.session.completed can route
      metadata: { businessId: ctx.businessId },
    });

    await prisma.$transaction(async (tx) =>
      audit(tx, ctx, "billing.checkout_started", "Subscription", sub.id, { plan, interval }));
    return { url: session.url! };
  },

  // ---------------------------------------------------------------
  // PORTAL — payment methods, invoices, cancellation UI by Stripe
  // ---------------------------------------------------------------
  async createPortalSession(ctx: TenantContext) {
    const sub = await prisma.subscription.findUnique({ where: { businessId: ctx.businessId } });
    if (!sub?.stripeCustomerId) throw new ValidationError("No billing account yet — subscribe to a plan first.");
    const session = await stripe().billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${APP_URL}/settings/billing`,
    });
    return { url: session.url };
  },

  // ---------------------------------------------------------------
  // PLAN CHANGE — upgrade/downgrade with Stripe-managed proration
  // ---------------------------------------------------------------
  async changePlan(ctx: TenantContext, plan: Exclude<PlanId, "FREE">, interval: "MONTHLY" | "YEARLY") {
    const sub = await prisma.subscription.findUnique({ where: { businessId: ctx.businessId } });
    if (!sub?.stripeSubscriptionId) throw new ValidationError("No active subscription to change.");

    const current = await stripe().subscriptions.retrieve(sub.stripeSubscriptionId);
    const item = current.items.data[0];

    const updated = await stripe().subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: item.id, price: stripePriceId(plan, interval) }],
      // Upgrades charge the difference now; downgrades credit the remainder.
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
    });

    await this.syncFromStripe(updated);
    await prisma.$transaction(async (tx) =>
      audit(tx, ctx, "billing.plan_changed", "Subscription", sub.id, { to: plan, interval }));
    return { plan, interval };
  },

  // ---------------------------------------------------------------
  // CANCEL (at period end) / RESUME
  // ---------------------------------------------------------------
  async cancel(ctx: TenantContext) {
    const sub = await prisma.subscription.findUnique({ where: { businessId: ctx.businessId } });
    if (!sub?.stripeSubscriptionId) throw new ValidationError("No active subscription.");
    const updated = await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    await this.syncFromStripe(updated);
    await prisma.$transaction(async (tx) => audit(tx, ctx, "billing.cancel_scheduled", "Subscription", sub.id));
  },

  async resume(ctx: TenantContext) {
    const sub = await prisma.subscription.findUnique({ where: { businessId: ctx.businessId } });
    if (!sub?.stripeSubscriptionId) throw new ValidationError("No subscription to resume.");
    const updated = await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: false });
    await this.syncFromStripe(updated);
    await prisma.$transaction(async (tx) => audit(tx, ctx, "billing.resumed", "Subscription", sub.id));
  },

  // ---------------------------------------------------------------
  // SYNC — Stripe subscription object -> local read model
  // ---------------------------------------------------------------
  async syncFromStripe(s: Stripe.Subscription) {
    const businessId = s.metadata.businessId;
    if (!businessId) { logger.warn("Stripe subscription without businessId metadata", { id: s.id }); return; }

    const priceId = s.items.data[0]?.price.id ?? null;
    const mapped = priceId ? planFromPriceId(priceId) : null;

    const statusMap: Record<string, "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE"> = {
      active: "ACTIVE", trialing: "TRIALING", past_due: "PAST_DUE",
      canceled: "CANCELED", unpaid: "PAST_DUE",
      incomplete: "INCOMPLETE", incomplete_expired: "CANCELED", paused: "CANCELED",
    };
    const status = statusMap[s.status] ?? "INCOMPLETE";

    await prisma.subscription.update({
      where: { businessId },
      data: {
        stripeSubscriptionId: s.id,
        stripePriceId: priceId,
        plan: status === "CANCELED" ? "FREE" : (mapped?.plan ?? "FREE"),
        interval: mapped?.interval ?? "MONTHLY",
        status,
        currentPeriodEnd: new Date(s.current_period_end * 1000),
        cancelAtPeriodEnd: s.cancel_at_period_end,
        trialEndsAt: s.trial_end ? new Date(s.trial_end * 1000) : null,
      },
    });
  },

  /** Owner emails for a business (billing notifications). */
  async ownerEmails(businessId: string): Promise<string[]> {
    const owners = await prisma.userBusiness.findMany({
      where: { businessId, role: "OWNER" },
      select: { user: { select: { email: true } } },
    });
    return owners.map((o) => o.user.email);
  },

  sendEmail: sendBillingEmail, // re-exported so the webhook imports one service
};
