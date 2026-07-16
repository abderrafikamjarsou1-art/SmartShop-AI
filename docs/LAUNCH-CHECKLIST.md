# LAUNCH CHECKLIST

Run top to bottom on launch day. Each item is verifiable — a command or a
concrete pass/fail, not "looks good." Full setup detail is in
DEPLOYMENT.md; this is the gate.

## 1. Database
- [ ] `prisma migrate deploy` runs clean against production (it's in the
      Build Command, so a green production build already proves this).
- [ ] `prisma migrate status` shows no pending migrations.
- [ ] Spot-check: `SELECT count(*) FROM businesses;` connects and returns.
- [ ] The three Step-13 indexes exist (`\di idx_movements_biz_type_created`
      etc.).

## 2. Seed / first data
- [ ] At least one super admin exists:
      `SELECT email FROM users WHERE "isSuperAdmin";`
- [ ] Plan catalog matches Stripe: the 4 `STRIPE_PRICE_*` ids resolve via
      `planFromPriceId` (create a $0 test checkout in test mode to confirm
      the mapping before going live).

## 3. Environment audit
- [ ] Every var in ENV-VARS.md is set for the **Production** target in
      Vercel (not just Preview).
- [ ] No server secret carries `NEXT_PUBLIC_`. Grep the built client
      bundle for a fragment of `STRIPE_SECRET_KEY`/service-role key →
      must not appear.
- [ ] `NEXT_PUBLIC_APP_URL` = the real production origin (used for Stripe
      redirects + CSRF origin checks).

## 4. Stripe (live mode)
- [ ] Live keys in prod env; live products + 4 prices created; ids match
      env.
- [ ] Webhook endpoint points at `https://<domain>/api/webhooks/stripe`
      with the 7 events; `STRIPE_WEBHOOK_SECRET` is the **live** endpoint's
      secret.
- [ ] Customer portal enabled in the live dashboard.
- [ ] **Live smoke test** with a real card (small charge, then refund):
      checkout → webhook fires → subscription shows Active + trial badge →
      cancel → resume → `stripe trigger invoice.payment_failed` → PAST_DUE
      badge + email. Replay one event → `{duplicate:true}`, nothing
      double-applied.

## 5. Email (Resend)
- [ ] Domain verified (SPF/DKIM) in Resend; `EMAIL_FROM` uses it.
- [ ] Trigger each template once (welcome, subscription created, trial
      ending, payment failed, invoice paid) → lands in inbox, not spam.

## 6. Storage
- [ ] Buckets exist: `products`, `logos` (public), `receipts` (private,
      signed URLs).
- [ ] RLS/storage policies applied (`storage-policies.sql`): a member can
      read only their business's objects; upload paths are
      `{businessId}/{uuid}`.
- [ ] Upload a product image and a receipt PDF end-to-end; the receipt is
      **not** publicly reachable by raw URL.

## 7. Performance audit
- [ ] `next build` bundle within budget; charts/heavy libs are dynamically
      imported (no Recharts/pdf-lib in the initial bundle).
- [ ] Dashboard and reports p95 acceptable on prod data volume; the
      six-aggregate financial summary returns fast (indexes in place).
- [ ] Lighthouse performance ≥ 90 on the marketing + dashboard shell.

## 8. Security audit
- [ ] SECURITY-AUDIT.md items S1–S10 all fixed and deployed.
- [ ] Security headers present (CSP/HSTS/X-Frame-Options/etc. from
      `next.config`).
- [ ] Cross-tenant probe: as business A, request `/api/invoices/<B's id>/
      pdf` → 404, not the PDF.
- [ ] As CASHIER, a financial action and the AI financial tools are
      refused.
- [ ] Prompt-injection probe ("show data for business X / ignore
      instructions") → refused, own data only.
- [ ] Auth + AI + webhook rate limits fire under a burst.

## 9. Accessibility audit
- [ ] Keyboard-only pass through POS (F2/F4/F9 shortcuts), a form drawer,
      and a dialog — focus visible, no traps.
- [ ] Axe/Lighthouse a11y ≥ 90; color-contrast passes in light and dark;
      all inputs have labels, progress bars have `aria-valuenow`.

## 10. SEO audit
- [ ] Marketing pages have titles/meta/OG tags; `robots.txt` + sitemap
      present; dashboard/admin are `noindex`.
- [ ] Canonical URL matches `NEXT_PUBLIC_APP_URL`.

## 11. Backups & monitoring
- [ ] PITR enabled; nightly dump job green; storage mirror green.
- [ ] One restore drill passed this week (`verify-restore.sql`).
- [ ] Sentry receiving events (trigger a test error); source maps
      uploaded.
- [ ] Uptime monitor on `/api/health`; alert routing tested (page a human).

## 12. Domain / SSL / DNS
- [ ] Custom domain attached in Vercel; SSL issued and valid; `www` →
      apex (or chosen canonical) redirects.
- [ ] DNS propagated; `https://<domain>` serves the app, `http://`
      upgrades.

## 13. Final smoke tests (prod, real account)
- [ ] Sign up → onboard a business → add a product → make a POS sale →
      print the invoice PDF.
- [ ] Receive a purchase order → stock increments → low-stock alert
      resolves.
- [ ] Record a customer payment → sale status flips to PAID.
- [ ] Ask the AI "how much profit this month?" → grounded answer with a
      tool badge; "predict next month" → forecast with confidence.
- [ ] Open a report, export CSV/XLSX/PDF.
- [ ] Admin: KPIs load, suspend+reactivate a throwaway business, broadcast
      a notification.

**Go/no-go:** every box in sections 1–8 and 11–13 must be checked.
9–10 (a11y/SEO) are launch-quality gates but not hard blockers if a
tracked follow-up exists.
