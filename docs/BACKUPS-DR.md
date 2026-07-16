# PHASE 5 — BACKUPS & DISASTER RECOVERY

## Objectives
RPO (max data loss): 24h baseline, ~2min with PITR (recommended at
launch on the Pro plan). RTO (max downtime): < 2 hours, drilled below.

## 1. Database backups

**Automatic (Supabase)**: daily snapshots, 7-day retention on Pro.
**Enable PITR** (Settings → Database → PITR): WAL archiving turns RPO
from 24h into ~2 minutes. This is the single best money spent on DR.

**Offsite weekly** (never depend on one vendor for backups):
```yaml
# .github/workflows/backup.yml
name: Weekly offsite backup
on:
  schedule: [{ cron: "0 3 * * 0" }]
  workflow_dispatch: {}
jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - run: |
          pg_dump "$DATABASE_URL" -Fc -f "backup-$(date +%F).dump"
          # encrypt before it leaves the runner
          gpg --batch --symmetric --passphrase "$BACKUP_PASSPHRASE" "backup-$(date +%F).dump"
        env:
          DATABASE_URL: ${{ secrets.DIRECT_DATABASE_URL }}
          BACKUP_PASSPHRASE: ${{ secrets.BACKUP_PASSPHRASE }}
      - uses: actions/upload-artifact@v4   # or aws s3 cp to a bucket in another region
        with: { name: db-backup, path: "*.gpg", retention-days: 90 }
```

## 2. Storage backups (product images, logos, receipts)
Weekly sync to a second provider (R2/S3) with rclone in the same
workflow:
```bash
rclone sync supabase:products r2:smartshop-backup/products
rclone sync supabase:receipts r2:smartshop-backup/receipts --s3-server-side-encryption AES256
```
Receipts are financial documents — encrypted at rest on the mirror.

## 3. Backup VERIFICATION (a backup untested is a hope, not a backup)
Monthly drill, 20 minutes, calendar-scheduled:
1. Spin a scratch Postgres: `docker run -e POSTGRES_PASSWORD=x -p 5434:5432 -d postgres:16`
2. `gpg -d backup.dump.gpg | pg_restore -d "postgresql://...:5434/postgres" --no-owner`
3. Run the verification script:
```sql
-- verify-restore.sql: the invariants a healthy restore must satisfy
SELECT COUNT(*) FROM businesses;                       -- > 0
SELECT COUNT(*) FROM sales WHERE total < 0;            -- = 0
-- ledger consistency: stock equals movement sums (sample 100 products)
SELECT COUNT(*) FROM (
  SELECT p.id FROM products p
  JOIN LATERAL (SELECT COALESCE(SUM(quantity),0) s FROM inventory_movements m
                WHERE m."productId" = p.id) m ON true
  WHERE p.quantity <> m.s LIMIT 100
) broken;                                              -- = 0
```
4. Log the drill (date, backup file, results) in docs/dr-drill-log.md.

## 4. Restore procedure (RUNBOOK — follow verbatim under stress)

**Scenario A — bad deploy corrupted data (most likely)**
1. `vercel rollback` (previous deployment, ~1 min) — stop the bleeding.
2. Supabase → Database → PITR → restore to timestamp just before the
   deploy. Supabase restores into the SAME project (in-place).
3. Health check green → announce recovery. Data loss: seconds.

**Scenario B — Supabase project lost**
1. Create new Supabase project (same region).
2. `pg_restore` the newest offsite dump (or Supabase support restores
   their snapshot).
3. `npx prisma migrate deploy` to reconcile any newer migrations.
4. Update DATABASE_URL/DIRECT_URL/SUPABASE_* env in Vercel → redeploy.
5. Re-run fixes/storage-policies.sql; rclone sync BACK from the mirror.
6. Rotate Supabase keys (old project's keys are dead anyway).
RTO honest estimate: 60–90 minutes. Practiced once = 40.

**Scenario C — Stripe/webhook divergence** (not data loss, drift)
Local subscriptions are a read model → resync from truth:
run scripts/resync-stripe.ts (iterates customers, calls
billingService.syncFromStripe per subscription).

## 5. What is NOT backed up (documented, deliberate)
- AI conversations (regenerable, low value, privacy-friendlier to lose)
- WebhookEvent ledger (only meaning is replay-protection for PAST events)
- UsageCounter (recomputable where it matters; storage re-syncs on drift)
