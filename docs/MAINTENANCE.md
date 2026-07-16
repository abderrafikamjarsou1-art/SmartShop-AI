# MAINTENANCE

Routine operations for a running production instance. Pairs with
BACKUPS-DR.md (recovery) and OBSERVABILITY.md (what to watch).

## Cadence

**Daily (automated, glance only)**
- PITR is on; the nightly encrypted `pg_dump` job and the storage mirror
  should show green. A failed backup job pages — don't wait for a glance.
- Health check green (uptime monitor on `/api/health`).

**Weekly (10 minutes)**
- Sentry: triage new issues; anything recurring gets an owner.
- `audit_logs`: skim `admin.*` actions and AI tool-call volume for
  anomalies.
- Dependabot/`npm audit`: merge patch-level security PRs after CI passes.

**Monthly**
- Restore drill: spin the latest dump into a scratch DB, run
  `verify-restore.sql` (row counts + ledger consistency). A backup you
  haven't restored isn't a backup.
- Review `pg_stat_statements` for the slowest queries; add an index if one
  has crept in (new index → same-PR discipline, `CONCURRENTLY` on big
  tables).
- Confirm Stripe/OpenAI/Resend keys are healthy and usage is within
  expected bands.

## Recurring expenses cron

Recurring expense templates materialize lazily on the expenses page load,
but for timeliness production should run a small cron (Vercel Cron →
a route that calls `expenseService.materializeDue()` per active business).
It's idempotent and cheap when nothing is due. If a month looks like it's
missing recurring instances, hitting the page once will backfill them.

## Dependency & runtime upgrades

- **Next.js / React**: upgrade on a branch, let the full CI matrix + the
  Playwright money-path run against the preview before merging.
- **Prisma**: regenerate client, run the migration suite against a scratch
  DB. The pinned Stripe `apiVersion` means Stripe SDK bumps are deliberate
  — read the changelog for the version you pin to.
- **Node**: match Vercel's supported LTS; the CI image and local `.nvmrc`
  should agree.

## Data hygiene

- Soft-deleted rows (`deletedAt`) accumulate. They're intentional (restore,
  audit), but a quarterly job can hard-delete rows soft-deleted > N months
  *and* free of financial history (the same guard the permanent-delete path
  uses). Never hard-delete anything referenced by a `SaleItem`/
  `PurchaseItem` snapshot.
- `webhook_events` and old `ai_messages` grow unbounded; a retention job
  (e.g. drop webhook rows > 90 days, summarize+prune very old AI messages)
  keeps them lean. `audit_logs` is the compliance record — archive, don't
  delete.

## Runbooks (quick index — full versions in BACKUPS-DR.md)

- **Bad deploy** → Vercel instant rollback to the previous build (safe
  because migrations are expansive-only).
- **Data loss** → PITR to just before the incident; last-resort restore
  from the offsite dump.
- **Stripe drift** (local ≠ Stripe) → re-run `syncFromStripe` for the
  affected subscription; Stripe is always the source of truth.
- **Suspended-by-mistake** → admin Reactivate; `assertNotSuspended` clears
  immediately.

## What NOT to do

- Don't hand-edit subscription rows to "fix" a plan — change it in Stripe
  and let the sync flow, or use the audited admin `setPlan` override.
- Don't add a query without `businessId` or an action without
  `requireRole`, even for a "quick" maintenance script that runs in-app.
- Don't drop/rename a column in the same release as code depending on it
  (breaks instant rollback) — two-deploy it.
