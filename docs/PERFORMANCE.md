# PHASE 2 — PERFORMANCE AUDIT

Method: trace the hot paths (dashboard load, products list, POS search,
sale commit, reports) and audit each documented category. Format:
finding → why it matters → fix.

## P1 — getCurrentUser() writes on EVERY request (biggest win)
Step 3's just-in-time sync `upsert`s the user row per request: dashboard
load = layout + page + N actions = several WRITES per navigation, all
pure overhead after the first login.
**Fix (fixes/auth-cache.patch.md)**: read first; write only when the row
is missing or profile fields actually changed (OAuth avatar/name drift).
Steady-state requests now do 1 indexed read, 0 writes. ~10–30ms saved
per request and vastly less WAL churn.

## P2 — Missing indexes for hot filters
Audited every WHERE against Step 2's indexes. Three gaps found:
```sql
-- movements filtered by type (ledger view, velocity queries)
CREATE INDEX idx_movements_biz_type_created
  ON inventory_movements ("businessId", type, "createdAt");
-- payment-method reports scan sale_payments by created date alone
CREATE INDEX idx_sale_payments_created ON sale_payments ("createdAt");
-- customer payments listed per business
CREATE INDEX idx_expenses_biz_supplier ON expenses ("businessId", "supplierId");
```
Everything else already rides Step 2 composites (verified with the
query list in docs/DATABASE.md).

## P3 — PO drawer loads 500 products eagerly
Step 8's form options fetch up to 500 products into the page payload.
Fine at 50 products, 300KB+ of RSC payload at 500.
**Fix**: the drawer's product select becomes an async combobox reusing
`searchPosProducts` (already built, debounced, indexed). Options fetch
drops to suppliers-only.

## P4 — Serializable retry (S4) is also a latency fix
Aborted transactions previously surfaced as user-visible failures →
manual retries (seconds). `withRetry` resolves conflicts in ~50–150ms
invisibly.

## P5 — Filter options fetched per request
Categories/suppliers for toolbars change rarely but are queried on
every products-page load.
**Fix**: wrap in `unstable_cache(fn, [businessId], { revalidate: 60,
tags: ["taxonomy-" + businessId] })`; create/update/delete of a
category/supplier calls `revalidateTag`. Correct + cached.

## Verified-good (audited, by design from earlier steps)
- **N+1**: none — every list uses `include`/`select` joins; reports use
  single-pass aggregates with LATERAL joins; grep for `for...await
  prisma.` confirms loops only inside transactions where each write is
  intentional (receiving lines, allocations).
- **Round trips**: dashboards/reports batch with Promise.all (6 parallel
  aggregates for financials); list+count share one $transaction.
- **Pagination**: server-side everywhere, perPage capped at 100 by Zod.
- **Server Components**: all pages are RSC; client components are leaves
  (tables, drawers, POS, chat). Zero data fetching from the client
  except POS search + AI (interactive by nature).
- **Streaming/Suspense**: route-level loading.tsx mirrors layouts (no
  CLS); report tabs stream independently.
- **Dynamic imports**: recharts behind next/dynamic ssr:false (dashboard,
  reports, AI charts); react-markdown only in the AI route bundle;
  xlsx/pdf-lib only in route handlers (server, never bundled to client).
- **Images**: next/image with explicit sizes; uploads compressed
  client-side to WebP ≤1600px (a 4MB photo ships as ~150KB).
- **Bundle**: heaviest client islands are POS and AI chat, each isolated
  to its route. Marketing/auth pages ship near-zero JS.
- **Memory**: CSV/import paths capped by validation (≤1000 rows); AI tool
  results truncated at 6KB; report queries aggregate in Postgres, not JS.
- **Cold starts**: Prisma singleton; no top-level heavy imports in
  middleware (only @supabase/ssr); logger/zod are tiny.
- **Caching**: AI tool cache (60s TTL) absorbs repeated tool calls;
  P5 adds taxonomy caching; everything financial stays uncached on
  purpose — correctness beats staleness for money.

## Scale posture (documented for the future, not built)
- Low-stock `IN (ids)` and velocity scans are fine to ~50k products/
  tenant; past that, a `product_stats` materialized view refreshed by
  cron is the upgrade path (service method is the single place to swap).
- Sequences: per-tenant max+1 with retry holds to hundreds of
  sales/minute/tenant; past that, move to a Postgres sequence per
  business (migration sketch in docs/DATABASE.md).
