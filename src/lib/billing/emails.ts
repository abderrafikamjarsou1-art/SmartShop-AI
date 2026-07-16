import "server-only";
import { Resend } from "resend";
import { logger } from "@/lib/logger";

/**
 * Billing emails — thin templates over Resend.
 * Degrades gracefully: without RESEND_API_KEY (local dev) it logs
 * instead of sending, so webhook processing never fails on email.
 */

const FROM = process.env.EMAIL_FROM ?? "SmartShop AI <billing@smartshop.ai>";

type TemplateKey = "welcome" | "subscriptionCreated" | "trialEnding" | "paymentFailed" | "invoicePaid";

const TEMPLATES: Record<TemplateKey, (p: Record<string, string>) => { subject: string; html: string }> = {
  welcome: (p) => ({
    subject: `Welcome to SmartShop AI, ${p.name}!`,
    html: wrap(`<h2>Welcome aboard 🎉</h2><p>Your shop <b>${p.business}</b> is ready. Add your first products and make your first sale — we'll handle the numbers.</p>`),
  }),
  subscriptionCreated: (p) => ({
    subject: `You're on the ${p.plan} plan`,
    html: wrap(`<h2>Subscription active</h2><p><b>${p.business}</b> is now on the <b>${p.plan}</b> plan (${p.interval?.toLowerCase()}). ${p.trial === "true" ? `Your free trial runs until <b>${p.trialEnd}</b> — you won't be charged before then.` : "Thank you for subscribing!"}</p>`),
  }),
  trialEnding: (p) => ({
    subject: "Your SmartShop AI trial ends in 3 days",
    html: wrap(`<h2>Trial ending soon</h2><p>Your trial for <b>${p.business}</b> ends on <b>${p.trialEnd}</b>. Your card will be charged automatically. Manage your plan any time from Settings → Billing.</p>`),
  }),
  paymentFailed: (p) => ({
    subject: "Payment failed — action needed",
    html: wrap(`<h2>We couldn't charge your card</h2><p>The payment for <b>${p.business}</b> failed. Stripe will retry automatically; to avoid interruption, update your payment method in the billing portal.</p>`),
  }),
  invoicePaid: (p) => ({
    subject: `Payment received — ${p.amount}`,
    html: wrap(`<h2>Thank you!</h2><p>We received <b>${p.amount}</b> for <b>${p.business}</b>. Your receipt is available in the billing portal.</p>`),
  }),
};

const wrap = (body: string) =>
  `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">${body}<p style="color:#888;font-size:12px;margin-top:32px">SmartShop AI</p></div>`;

export async function sendBillingEmail(template: TemplateKey, to: string, params: Record<string, string>) {
  const { subject, html } = TEMPLATES[template](params);
  if (!process.env.RESEND_API_KEY) {
    logger.info(`[email stub] ${template} -> ${to}: ${subject}`);
    return;
  }
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({ from: FROM, to, subject, html });
  } catch (error) {
    // Email must never break billing flows
    logger.error(`Billing email failed: ${template}`, { error, to });
  }
}
