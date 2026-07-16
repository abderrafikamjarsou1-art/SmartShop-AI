import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/billing/stripe";
import { billingService } from "@/services/billing-service";
import { PLANS, planFromPriceId } from "@/lib/billing/plans";
import { logger } from "@/lib/logger";

/**
 * POST /api/webhooks/stripe
 *
 * SECURITY:
 *  1. SIGNATURE: constructEvent verifies the raw body against
 *     STRIPE_WEBHOOK_SECRET — a forged request is rejected with 400
 *     before anything is read from it.
 *  2. IDEMPOTENCY: every event id is inserted into webhook_events FIRST.
 *     The unique constraint makes Stripe's aggressive retries no-ops —
 *     a replayed invoice.paid can never double-apply. (Same pattern as
 *     PurchaseReceipt in Step 8.)
 *  3. Handlers are thin: they route to billingService.syncFromStripe(),
 *     the single writer of subscription state.
 */

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    // MUST use the raw text body — any parsing first breaks the signature
    const rawBody = await request.text();
    event = stripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", { error: err instanceof Error ? err.message : err });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // IDEMPOTENCY GATE
  try {
    await prisma.webhookEvent.create({ data: { stripeEventId: event.id, type: event.type } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true }); // replay -> no-op, 200 stops retries
    }
    throw e;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.subscription) {
          const sub = await stripe().subscriptions.retrieve(session.subscription as string);
          await billingService.syncFromStripe(sub);
          const businessId = sub.metadata.businessId;
          if (businessId) {
            const mapped = sub.items.data[0] ? planFromPriceId(sub.items.data[0].price.id) : null;
            const emails = await billingService.ownerEmails(businessId);
            const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
            for (const to of emails) {
              await billingService.sendEmail("subscriptionCreated", to, {
                business: business?.name ?? "your shop",
                plan: mapped ? PLANS[mapped.plan].name : "Pro",
                interval: mapped?.interval ?? "MONTHLY",
                trial: String(!!sub.trial_end),
                trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toLocaleDateString() : "",
              });
            }
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        await billingService.syncFromStripe(sub);
        // Stripe fires trial_will_end 3 days before; we also catch it here
        break;
      }

      case "customer.subscription.trial_will_end": {
        const sub = event.data.object;
        const businessId = sub.metadata.businessId;
        if (businessId && sub.trial_end) {
          const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
          for (const to of await billingService.ownerEmails(businessId)) {
            await billingService.sendEmail("trialEnding", to, {
              business: business?.name ?? "your shop",
              trialEnd: new Date(sub.trial_end * 1000).toLocaleDateString(),
            });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        await billingService.syncFromStripe(event.data.object); // status canceled -> plan FREE
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId = invoice.subscription as string | undefined;
        if (subId) {
          const sub = await stripe().subscriptions.retrieve(subId);
          await billingService.syncFromStripe(sub); // -> PAST_DUE
          const businessId = sub.metadata.businessId;
          if (businessId) {
            const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
            for (const to of await billingService.ownerEmails(businessId)) {
              await billingService.sendEmail("paymentFailed", to, { business: business?.name ?? "your shop" });
            }
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const subId = invoice.subscription as string | undefined;
        if (subId) {
          const sub = await stripe().subscriptions.retrieve(subId);
          await billingService.syncFromStripe(sub);
          const businessId = sub.metadata.businessId;
          if (businessId && invoice.amount_paid > 0) {
            const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
            for (const to of await billingService.ownerEmails(businessId)) {
              await billingService.sendEmail("invoicePaid", to, {
                business: business?.name ?? "your shop",
                amount: `${(invoice.amount_paid / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`,
              });
            }
          }
        }
        break;
      }

      default:
        // Acknowledged but not handled — keeps the endpoint quiet in logs
        break;
    }
  } catch (error) {
    logger.error(`Stripe webhook handler failed: ${event.type}`, { error, eventId: event.id });
    // 500 -> Stripe retries; our idempotency row already exists, so delete
    // it to allow the retry to process (failed events must be re-runnable)
    await prisma.webhookEvent.delete({ where: { stripeEventId: event.id } }).catch(() => {});
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
