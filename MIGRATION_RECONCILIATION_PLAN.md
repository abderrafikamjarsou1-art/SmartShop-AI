# Migration Reconciliation Plan

**Status: investigation complete, no action taken. Nothing has been run
against the live database. Explicit human confirmation is required
before any of the commands below are executed against it.**

## 1. What we know (verified facts)

`npx prisma migrate status`, run read-only against the connected
database during the original audit (`AUDIT_REPORT.md` §2, §5), reported:

```
Datasource "db": PostgreSQL database "postgres", schema "public" at
"aws-1-eu-west-2.pooler.supabase.com:5432"

2 migrations found in prisma/migrations
Following migrations have not yet been applied:
00000000000000_init
20260718123650_add_user_password
```

`prisma validate` on the same connection confirmed the *schema file*
itself is internally consistent — this is not a broken schema, it's a
tracking discrepancy between `prisma/schema.prisma`/`prisma/migrations/`
and the connected database's `_prisma_migrations` bookkeeping table.

Reading the migration files themselves (local, no DB connection
needed):

- **`prisma/migrations/00000000000000_init/migration.sql`** — 527
  lines, pure `CREATE TYPE` / `CREATE TABLE` / `CREATE INDEX`
  statements. **Zero `DROP` statements of any kind.** Its own header
  comment reads:
  > `-- SmartShop AI — baseline schema (init)`
  > `-- Derived from prisma/schema.prisma (v1.0.0). Verify with`
  > `` `npx prisma migrate status` `` `on first deploy.`

  A migration named `00000000000000` (an all-zero timestamp, not a real
  migration timestamp like the second one) combined with that exact
  comment is the standard signature of a **hand-authored baseline
  migration** — generated to *describe* an already-existing schema so
  Prisma's migration history has a starting point, not written to be
  blindly executed against a database that doesn't have these tables
  yet. The comment is explicitly telling the next deployer to check
  `migrate status` before doing anything, which is exactly what the
  audit did.

- **`prisma/migrations/20260718123650_add_user_password/migration.sql`**
  — one line: `ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT;`.
  Purely additive, non-destructive, safe to run against a database that
  already has the `users` table but not yet the column.

## 2. What this means — two possible scenarios

Both migrations showing "not yet applied" is consistent with **two
very different real states**, and running `prisma migrate deploy`
blindly is only safe in one of them:

### Scenario A — Baseline gap (most likely, given the init migration's own comment)
The connected database's tables **already exist** — most likely
because it was originally provisioned via `prisma db push`, a manual
SQL import, or directly through the Supabase dashboard — none of which
write to `_prisma_migrations`. The schema is fine; only Prisma's
bookkeeping is missing. In this scenario, running `prisma migrate
deploy` would try to `CREATE TABLE`/`CREATE TYPE` for objects that
already exist and **fail on the first statement** (or, worse, partially
apply before failing, leaving the migration table in a half-applied
state) — a real risk, not a hypothetical one.

**Correct fix: baseline it.** Prisma's own documented procedure for
this exact situation is `prisma migrate resolve --applied
<migration_name>`, which only writes a row to `_prisma_migrations`
marking the migration as already applied — it runs **no SQL at all**
against the database. Zero risk to existing data.

### Scenario B — Genuinely fresh/empty database
The connected database has no `users`/`businesses`/etc. tables at all
(e.g., a newly provisioned Supabase project that's never been
migrated). In this scenario, `prisma migrate deploy` is exactly the
right, safe command — there's nothing to lose.

## 3. Why we can't tell which scenario applies from this environment

Determining this requires one read-only query against the live
database (e.g. `SELECT to_regclass('public.users');` or a full
`information_schema.tables` listing) or an equivalent tool run
(`prisma migrate diff --from-url ... --to-migrations ...`, which is
also read-only — it only prints a diff, it does not execute anything).

A first attempt at this in this session (a one-off Prisma Client
script) failed for an environment reason, not a data reason: the script
lived in a scratch directory with no `node_modules` in its ancestry, so
Node couldn't resolve `@prisma/client` — module resolution walks up
from the *importing file's own directory*, and the scratch path had no
project dependencies anywhere above it. Per the user's direction, this
was not retried; the safe read-only inspection step below is left for
whoever executes this plan, run from inside the project directory
where module resolution works normally.

## 4. The plan (each step requires explicit sign-off before running)

**Step 1 — Inspect (read-only, safe to run anytime, changes nothing):**
```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-migrations prisma/migrations \
  --script
```
This prints the SQL that would need to run to bring the *database* in
line with the *migrations folder* — without executing any of it. If it
prints essentially the same `CREATE TABLE ...` statements as
`00000000000000_init/migration.sql`, that confirms **Scenario B**
(tables genuinely missing). If it prints little or nothing beyond the
`passwordHash` column, that confirms **Scenario A** (tables already
exist, just the `passwordHash` column and bookkeeping are missing).

Alternative equivalent check, if direct SQL access is preferred: a
single read-only query against `information_schema.tables` and
`_prisma_migrations` (both listed explicitly so this can be pasted into
the Supabase SQL editor or `psql` without needing any script):
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

SELECT migration_name, finished_at FROM "_prisma_migrations"
ORDER BY started_at;
```

**Step 2a — If Scenario A (tables already exist):**
```bash
npx prisma migrate resolve --applied 00000000000000_init
npx prisma migrate resolve --applied 20260718123650_add_user_password
```
Writes bookkeeping rows only. No schema/data change. Re-run `npx prisma
migrate status` afterward to confirm it reports "Database schema is
up to date."

**Step 2b — If Scenario B (tables genuinely don't exist):**
```bash
npx prisma migrate deploy
```
Applies both migrations in order for real. Take a fresh Supabase
snapshot (or confirm the daily snapshot already covers this moment)
immediately before running this, purely as a safety net — the
migration SQL itself is non-destructive (no drops), but this is
standard practice before any first-time schema deploy to a database
that might have data in tables outside Prisma's tracked set.

**Step 3 — Either path:** run `npx prisma migrate status` once more
and confirm it reports a clean, in-sync state before considering this
closed.

## 5. What was deliberately NOT done

- No `prisma migrate reset` (destroys all data — never appropriate
  here).
- No `prisma migrate deploy` or `migrate resolve` executed in this
  session — both require knowing which scenario applies first, and
  that determination needs a live read-only query this session did not
  run (see §3).
- No assumption made about which scenario is true. The migration
  file's own wording (§1) makes Scenario A more likely, but "more
  likely" is not "confirmed," and this is exactly the kind of decision
  that should not be made on inference alone when the blast radius is
  the production schema.

**Next step is yours: run Step 1 above, share the output, and confirm
which of Step 2a/2b to run before either is executed.**
