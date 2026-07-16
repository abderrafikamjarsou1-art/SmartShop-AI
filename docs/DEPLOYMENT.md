# DEPLOYMENT — Production Setup (Phase 7)

Order matters: infrastructure → secrets → deploy → webhooks → verify.

## 1. Supabase production project

1. Create a new project (region close to users — `eu-west` for Morocco).
2. Enable PITR (Pro plan) — see BACKUPS-DR.md.
3. Auth → URL Configuration:
   - Site URL: `https://app.yourdomain.com`
   - Redirect URLs: `https://app.yourdomain.com/auth/callback`
4. Auth → Providers: enable Email + Google (prod OAuth client with the
   production redirect URI).
5. Run migrations against prod (from CI or once locally):
   `DATABASE_URL=<prod-pooler-url> npx prisma migrate deploy`
6. Storage: create buckets `logos`, `products` (public), `receipts`
   (PRIVATE) and apply `fixes/storage-policies.sql` in the SQL editor
   (tenant-prefixed paths + size/MIME constraints — see SECURITY-AUDIT S1/S2/S6).
7. Database → Connection pooling: use the **transaction pooler** URL
   (port 6543, `?pgbouncer=true`) as DATABASE_URL; keep the direct URL
   (5432) as DIRECT_URL for migrations.

## 2. Stripe live mode

1. Toggle to Live mode → recreate Pro/Business products with monthly +
   yearly prices → copy the 4 live price ids.
2. Enable the Customer Portal (Settings → Billing → Customer portal).
3. Webhook endpoint: `https://app.yourdomain.com/api/webhooks/stripe`
   with the 7 events from Step 12 SETUP → copy the LIVE signing secret.
4. Activate your account (business verification) before real charges.

## 3. Resend production

1. Add and verify your domain (SPF + DKIM records below).
2. Create a production API key.
3. Set EMAIL_FROM to a verified sender, e.g.
   `SmartShop AI <billing@yourdomain.com>`.

## 4. Vercel project

1. Import the Git repository. Framework: Next.js (auto).
2. Build Command (runs expansive-only migrations before build — CI/CD doc):
   `npx prisma migrate deploy && next build`
3. Node.js 20.x. Region: `cdg1` (Paris) to sit near the DB.
4. Environment Variables (Production scope) — full list in ENV-VARS.md:
   DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL,
   NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
   OPENAI_API_KEY, STRIPE_SECRET_KEY (live), STRIPE_WEBHOOK_SECRET (live),
   STRIPE_PRICE_PRO_MONTHLY/YEARLY, STRIPE_PRICE_BUSINESS_MONTHLY/YEARLY,
   RESEND_API_KEY, EMAIL_FROM, NEXT_PUBLIC_APP_URL, SENTRY_DSN,
   SENTRY_AUTH_TOKEN, CRON_SECRET.
   Mark every secret "Sensitive" (write-only). Preview scope gets the
   TEST-mode Stripe keys and a staging Supabase project — previews must
   never touch production data.

## 5. Custom domain + SSL + DNS

| Record | Host | Value |
|---|---|---|
| CNAME | `app` | `cname.vercel-dns.com` |
| TXT (SPF) | `@` | per Resend dashboard |
| CNAME ×3 (DKIM) | per Resend | per Resend dashboard |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:admin@yourdomain.com` |

Add `app.yourdomain.com` in Vercel → Domains. SSL is automatic
(Let's Encrypt); verify the padlock + HSTS header (from the security
headers added in next.config — SECURITY-AUDIT S7).

## 6. Cron jobs (vercel.json)

```json
{
  "crons": [
    { "path": "/api/cron/recurring-expenses", "schedule": "0 3 * * *" },
    { "path": "/api/cron/trial-reminders",   "schedule": "0 8 * * *" }
  ]
}
```

Each cron route must check `Authorization: Bearer ${CRON_SECRET}` (Vercel
sends it automatically) — reject anything else with 401. The
recurring-expenses route calls `expenseService.materializeDue()` per
active business; trial-reminders is a safety net alongside Stripe's
`trial_will_end` event.

## 7. Health endpoint

`GET /api/health` (created in Phase 4) — checks DB connectivity + env
completeness, returns 200/503. Point an uptime monitor (UptimeRobot /
Better Stack, 1-min interval) at it and alert on 2 consecutive failures.

## 8. First-deploy sequence

1. Merge to `main` → CI green → Vercel builds → migrations run → live.
2. Run the LAUNCH-CHECKLIST.md top to bottom before announcing.
3. Create your super admin: `UPDATE users SET "isSuperAdmin" = true WHERE email = '...';`

## Decisions worth knowing

- **Pooler for runtime, direct for migrations**: serverless functions
  need PgBouncer (transaction mode) or they exhaust Postgres connections;
  Prisma migrate needs session mode, hence the two URLs.
- **Migrations in the Build Command, expansive-only**: deploy can never
  outrun schema (the build that ships code also ships its schema), and
  because migrations are expansive (add, never drop/rename in the same
  release), an instant rollback to the previous build still runs safely
  against the new schema.
- **Preview = staging Supabase + Stripe test keys**: PR review with real
  interactivity, zero blast radius.
