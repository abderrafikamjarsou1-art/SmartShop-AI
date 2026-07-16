# Runbook 04 — Vercel (Phase 6)

Deploy the app, wire env, domain, caching, crons.

## 1. Import & framework
- Import the Git repo. Framework preset: **Next.js** (auto-detected).
- Node.js: **20.x**. Region: **cdg1 (Paris)** — colocated with the
  eu-west-3 Supabase project to minimize DB latency (`vercel.json` pins
  this).

## 2. Build command
`npx prisma migrate deploy && next build` (set in `vercel.json`).
- Migrations run **before** the build ships, so code can never go live
  ahead of its schema. Because migrations are expansive-only, an instant
  rollback to the previous build still runs against the newer schema.

## 3. Environment variables
- Add every key from `.env.production.example` with target **Production**;
  mark secrets **Sensitive** (write-only).
- **Preview** target gets the **staging Supabase project + Stripe TEST
  keys** — previews must never touch production data or live money.
- Development target can mirror your `.env.local`.

## 4. Custom domain, SSL
- Project → Domains → add `app.yourdomain.com` (DNS in runbook 05).
- SSL issues automatically (Let's Encrypt). Confirm the padlock and that
  `http://` upgrades to `https://`.

## 5. Image optimization
- The app uploads to Supabase Storage; add the Supabase Storage hostname
  to `next.config` `images.remotePatterns` so `next/image` can optimize
  and serve them (and any other external image origin you use).
- Product/logo images are already compressed client-side to WebP before
  upload (Step 5) — Vercel's optimizer handles resizing/AVIF on delivery.

## 6. Caching
- Static assets and the marketing shell are cached on Vercel's edge by
  default. Dashboard data is dynamic (per-tenant, per-user) — served from
  the functions region, revalidated by the `revalidatePath`/
  `revalidateTag` calls the app already makes on mutations. Don't add
  blanket caching in front of authenticated routes.
- The security headers (SECURITY-AUDIT S7) set `Cache-Control`
  appropriately via `next.config`; verify no `Cache-Control: public` leaks
  onto an authenticated response.

## 7. Edge vs Node functions
- Keep API routes on the **Node.js runtime** (default). They use Prisma
  and the Stripe SDK, which need Node — do **not** move them to the Edge
  runtime. The `functions` block in `vercel.json` raises `maxDuration` for
  the streaming AI route (60s), the webhook (30s), and PDF routes (30s).

## 8. Cron jobs
- `vercel.json` registers `/api/cron/recurring-expenses` at 03:00 UTC
  daily. Copy `config/cron-recurring-expenses.route.ts` into
  `src/app/api/cron/recurring-expenses/route.ts` before deploying, or the
  scheduled call 404s.
- Trial reminders are handled by Stripe's `trial_will_end` webhook
  (runbook 02), so **no second cron is needed** — this supersedes the
  earlier "trial-reminders cron" note. Add one later only if you want a
  provider-independent fallback.
- The route authenticates with `Authorization: Bearer $CRON_SECRET`
  (Vercel sends it); anything else → 401.

## 9. Health monitoring
- `GET /api/health` returns 200/503 (DB ping + env completeness). Point
  UptimeRobot / Better Stack at it, 1-minute interval, alert on 2
  consecutive failures.

## Verify checklist
- [ ] Production build green; migrations ran in the build log.
- [ ] All prod env vars set + Sensitive; preview uses test/staging.
- [ ] Domain attached, SSL valid, http→https.
- [ ] Supabase Storage host in `images.remotePatterns`.
- [ ] API routes on Node runtime; maxDuration set for ai/webhook/pdf.
- [ ] Cron route file present; a manual `curl` with the bearer returns ok,
      without it returns 401.
- [ ] Uptime monitor live on `/api/health`.
