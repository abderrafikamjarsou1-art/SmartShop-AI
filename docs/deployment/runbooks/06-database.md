# Runbook 06 — Database (Phase 2)

Prepare and verify the production Postgres. Run in this exact order; each
step gates the next.

## Deployment order

### 1. Connection strings
- `DATABASE_URL` → **transaction pooler** (port 6543, `?pgbouncer=true&connection_limit=1`) — the runtime.
- `DIRECT_URL` → **direct/session** (port 5432) — migrations only.
- Why two: serverless functions exhaust Postgres without PgBouncer;
  Prisma Migrate needs session mode. This split is not optional on Vercel.

### 2. Extensions
Supabase ships what we need enabled by default. Confirm:
```sql
-- uuid generation (default UUID PKs) and text search helpers
SELECT * FROM pg_extension WHERE extname IN ('uuid-ossp','pgcrypto','pg_stat_statements');
```
- `pg_stat_statements` is what MAINTENANCE.md uses to find the next slow
  query — enable it under Database → Extensions if absent.

### 3. Migrations
```bash
# From CI (preferred) or once locally, against the DIRECT url:
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
```
- In production this runs automatically inside the Vercel **Build
  Command** (`prisma migrate deploy && next build`), so deploy can never
  outrun schema.
- Verify: `npx prisma migrate status` → "Database schema is up to date".

### 4. Indexes
The base composite indexes ship with the schema. Confirm the three
Step-13 additions landed:
```sql
SELECT indexname FROM pg_indexes
WHERE indexname IN (
  'idx_movements_biz_type_created',
  'idx_sale_payments_created',
  'idx_expenses_biz_supplier'
);  -- expect 3 rows
```
- If you ever add an index to a large table post-launch, create it
  `CONCURRENTLY` in a manual SQL migration to avoid write locks.

### 5. RLS & storage policies
- Table access is mediated by the Prisma service layer (tenant-scoped),
  but Storage is enforced by policy. Apply `fixes/storage-policies.sql`
  in the SQL editor: private `receipts`, membership read policies,
  tenant-prefixed upload paths, size/MIME constraints (SECURITY-AUDIT
  S1/S2/S6).
- Verify: `SELECT bucket_id, name FROM storage.buckets;` shows
  `logos`, `products`, `receipts`, and `receipts.public = false`.

### 6. Backups
- Enable **PITR** (Supabase Pro) — Database → Backups.
- Confirm the nightly encrypted `pg_dump` GitHub Action has its secrets
  and ran green at least once (BACKUPS-DR.md).
- Run one restore drill into a scratch DB and execute `verify-restore.sql`
  (row counts + ledger consistency) before launch.

### 7. Super admin
After the first successful deploy:
```sql
UPDATE users SET "isSuperAdmin" = true WHERE email = 'you@yourdomain.com';
```

## Raw-SQL reminder
Columns are camelCase; tables snake_case. Any hand-written SQL must quote
identifiers: `"businessId"`, `"createdAt"`. Unquoted → Postgres lowercases
them and the query fails.

## Verify checklist
- [ ] Pooler + direct URLs both connect (`psql "$DATABASE_URL" -c 'select 1'`).
- [ ] `prisma migrate status` clean.
- [ ] 3 Step-13 indexes present.
- [ ] 3 buckets present; `receipts` private.
- [ ] PITR on; one restore drill passed.
- [ ] Super admin set.
