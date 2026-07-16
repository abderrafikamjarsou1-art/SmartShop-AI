# SmartShop AI — Deployment Report (Phase 10)

The single reference for the production deployment: what it is, where it
lives, and the four procedures you'll actually run (backup, rollback,
monitoring, maintenance). It ties together the runbooks, the checklist,
and the Step-13 docs.

## Deployment guide (the path)
1. **Supabase** (runbook 01) → project, auth, OAuth, buckets, PITR.
2. **Database** (runbook 06) → connection strings, migrations, indexes,
   policies, one restore drill.
3. **Stripe Live** (runbook 02) → products/prices, portal, webhook + 7
   events, verify each.
4. **Resend** (runbook 03) → verify domain, key, confirm every template.
5. **Vercel** (runbook 04) → import, env, build command, domain, crons,
   health monitor.
6. **Domain/DNS/SEO** (runbook 05) → DNS, SSL, headers, robots/sitemap,
   OG/favicons.
7. **Verify** → Phase-8 matrix, then the **Go-Live Checklist** top to
   bottom. All 🔴 PASS → announce.

Ordering rationale: infrastructure and data must exist before the app that
depends on them; the app must be verified before the domain points real
users at it. Migrations run inside the Vercel build, so schema can never
lag code.

## Production URLs
| Thing | URL |
|---|---|
| App | `https://app.yourdomain.com` |
| Marketing/apex | `https://yourdomain.com` (redirects to app or serves marketing) |
| Health | `https://app.yourdomain.com/api/health` |
| robots / sitemap | `/robots.txt` · `/sitemap.xml` |

## Webhook URLs
| Source | URL | Events | Secret |
|---|---|---|---|
| Stripe (live) | `https://app.yourdomain.com/api/webhooks/stripe` | checkout.session.completed, customer.subscription.created/updated/deleted, customer.subscription.trial_will_end, invoice.paid, invoice.payment_failed | `STRIPE_WEBHOOK_SECRET` (live) |

Supabase auth callbacks (`/auth/callback`, `/auth/confirm`) are not
webhooks but must be in the Supabase redirect allow-list (runbook 01).

## Environment variables
Full annotated list: `.env.production.example` + `docs/ENV-VARS.md`.
The non-negotiables: only 3 `NEXT_PUBLIC_*` are browser-safe; runtime uses
the **pooler** URL and migrations the **direct** URL; live Stripe keys +
live price ids in Production scope only; Preview uses test keys + staging
Supabase.

---

## Backup procedure
- **PITR** (Supabase Pro): continuous; restore to any point in the
  retention window from Database → Backups. First line of recovery.
- **Nightly encrypted `pg_dump`** (GitHub Action) → offsite storage;
  independent of Supabase, survives a project-level loss.
- **Storage mirror** (`rclone`) → the `products`/`logos`/`receipts` buckets
  copied offsite.
- **Verification**: monthly restore drill into a scratch DB +
  `verify-restore.sql` (row counts + ledger consistency). A backup you
  haven't restored isn't a backup. Full detail: `docs/BACKUPS-DR.md`.

## Rollback procedure
- **Code**: Vercel → Deployments → previous build → **Promote to
  Production** (instant). Safe because migrations are **expansive-only** —
  the older code runs fine against the newer schema.
- **Bad migration**: never drop/rename in the same release as dependent
  code. If data is wrong, **PITR** to just before the incident; last
  resort is restoring the offsite dump.
- **Stripe drift** (local ≠ Stripe): re-run `syncFromStripe` for the
  affected subscription — Stripe is always the source of truth; we never
  hand-edit subscription rows.
- **Suspend-by-mistake**: admin Reactivate clears it immediately.
Runbooks A/B/C in `docs/BACKUPS-DR.md`.

## Monitoring guide
- **Uptime**: monitor on `/api/health` (1-min, alert on 2 consecutive
  fails). 503 tells you DB or an env var is the problem.
- **Errors**: Sentry (server + client), PII scrubbed in `beforeSend`;
  `safeAction` reports exceptions with a request id.
- **Tracing/perf**: `@vercel/otel` + Prisma tracing; Vercel Speed
  Insights; `pg_stat_statements` for slow queries.
- **Audit**: `audit_logs` is the who-did-what record (every mutation + AI
  tool call + `admin.*`). Full setup: `docs/OBSERVABILITY.md`.

## Maintenance guide
- **Daily** (automated): backups green, health green.
- **Weekly**: triage Sentry; skim `audit_logs` (`admin.*`, AI volume);
  merge patch-level security PRs after CI.
- **Monthly**: restore drill; review slowest queries (add an index if one
  crept in, `CONCURRENTLY` on big tables); confirm key health.
- **Cron**: `/api/cron/recurring-expenses` (03:00 UTC) materializes
  recurring expense instances; idempotent. Trial emails are handled by the
  Stripe `trial_will_end` webhook (no separate cron).
- **Golden rules**: don't hand-edit subscriptions (change in Stripe / use
  the audited admin override); never add a query without `businessId` or
  an action without `requireRole`; two-deploy any destructive migration.
Full playbook: `docs/MAINTENANCE.md`.

## Status
The platform is feature-complete, hardened (Step 13), and this kit
prepares every production dependency. Deployment readiness is gated only by
executing the runbooks and passing the Go-Live Checklist — no code or
business-logic changes remain. Overall production-readiness: **9/10**
(the last point earned by real users + an external pen-test on live infra).
