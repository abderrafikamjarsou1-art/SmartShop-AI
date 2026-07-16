# Runbook 02 — Stripe Live (Phase 4)

Everything here happens in **Live mode** (top-left toggle). Test-mode
objects do not carry over — you recreate products/prices and get new ids.

## 0. Activate the account
Business verification must be complete before real charges. Do this first;
approval can take time.

## 1. Products & prices
Recreate the two paid plans, each with a monthly and a yearly price:
| Product | Price | Interval | Env var |
|---|---|---|---|
| Pro | $29 | monthly | `STRIPE_PRICE_PRO_MONTHLY` |
| Pro | $290 | yearly | `STRIPE_PRICE_PRO_YEARLY` |
| Business | $79 | monthly | `STRIPE_PRICE_BUSINESS_MONTHLY` |
| Business | $790 | yearly | `STRIPE_PRICE_BUSINESS_YEARLY` |

- The prices/amounts here must match `lib/billing/plans.ts` (that catalog
  is display truth; Stripe is charge truth — keep them equal).
- Copy the 4 **live** price ids into Vercel prod env. `planFromPriceId()`
  reverse-maps them in the webhook, so a wrong id = plan shows as FREE.
- Trials: the app sets `trial_period_days` from the catalog (14 days) at
  checkout — you do **not** configure trials on the Stripe price.

## 2. Coupons & promotion codes
- Create coupons under **Products → Coupons** (e.g. `LAUNCH20` = 20% off 3
  months). Create customer-facing **promotion codes** on top of them.
- To let customers enter codes at checkout, set
  `allow_promotion_codes: true` on the Checkout Session. This is a
  one-line config flag on the existing checkout call, not new logic —
  add it in `billingService.createCheckoutSession` if you want codes live
  at launch; otherwise apply discounts from the dashboard per customer.

## 3. Customer Portal
Settings → Billing → **Customer portal**: enable it (required before
`billingPortal.sessions.create` works). Allow: update payment method,
view invoices, cancel. Cancellation mode: **at period end** (matches the
app's cancel semantics).

## 4. Tax
- If you charge tax, enable **Stripe Tax** (Settings → Tax) and set your
  origin address + registrations. Stripe then computes tax on checkout and
  invoices automatically.
- The app's own 20% TVA on POS invoices is a separate, in-shop concern
  (Morocco VAT on sales to end customers) and is unaffected by Stripe Tax,
  which applies to the SaaS subscription. Don't conflate the two.

## 5. API keys
- `STRIPE_SECRET_KEY` = `sk_live_…` in **Production** scope only.
- Preview scope keeps `sk_test_…` so PR review can't touch live money.

## 6. Webhook endpoint (verify every event)
Developers → Webhooks → Add endpoint:
- URL: `https://app.yourdomain.com/api/webhooks/stripe`
- Events (the 7 the handler implements):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.trial_will_end`
  - `invoice.paid`
  - `invoice.payment_failed`
- Copy the endpoint's **Signing secret** → `STRIPE_WEBHOOK_SECRET` (live).

### Verify the webhook works
1. In the endpoint page, **Send test event** for each of the 7 → each
   returns 2xx.
2. **Replay** any delivered event → the handler returns
   `{duplicate:true}` (idempotency: the `webhook_events` unique constraint
   turns retries into no-ops).
3. Real end-to-end: run the live smoke test in runbook 08 (checkout with a
   real card → `subscription.created` fires → app shows the plan).

## Verify checklist
- [ ] Account activated for live charges.
- [ ] 4 live prices created; ids in prod env; amounts match the catalog.
- [ ] Customer portal enabled, cancel-at-period-end.
- [ ] Tax configured (or intentionally off).
- [ ] Live keys in Production scope; test keys only in Preview.
- [ ] Webhook endpoint live; 7 events; live signing secret set.
- [ ] All 7 test events 2xx; a replay returns duplicate.
