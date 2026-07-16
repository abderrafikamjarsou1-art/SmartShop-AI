# DATABASE

Postgres (Supabase). Prisma is the only client. This is the reference
for the schema, the indexes, the query strategies, and the migration
discipline the rest of the docs point at.

## Model map (24+ models)

Grouped by concern:

- **Identity & tenancy**: `User`, `Business`, `UserBusiness` (join with
  `role`), `Subscription`.
- **Catalog**: `Category`, `Product`, `ProductImage`.
- **Stock ledger**: `InventoryMovement` (append-only), `Notification`
  (low-stock alerts live here).
- **Selling**: `Sale`, `SaleItem` (price/cost snapshots), `SalePayment`
  (signed; refunds negative), `Invoice`.
- **Buying**: `Purchase`, `PurchaseItem` (cost snapshot +
  `receivedQuantity`/`returnedQuantity`), `PurchaseReceipt` (idempotency
  anchor).
- **Parties money**: `CustomerPayment` (FIFO allocations Json).
- **Spending & recurring**: `Expense` (+ recurring template fields).
- **AI**: `AiConversation` (rolling summary), `AiMessage` (tool calls Json).
- **Platform**: `WebhookEvent` (Stripe idempotency), `UsageCounter`
  (table-less metrics only), `AuditLog` (every mutation + AI tool call).

Conventions: UUID PKs; tables `@@map` to snake_case, **columns stay
camelCase** (raw SQL must quote `"businessId"` etc.); soft delete via
`deletedAt`; per-business sequential ints (`saleNumber`, `purchaseNumber`,
`invoiceNumber`) with `@@unique([businessId, n])`.

## The tenant-isolation invariant

Every business-owned row has `businessId`. Every service query filters by
`ctx.businessId`, and single-row reads use `findFirst({ where: { id,
businessId } })` — **never** `findUnique({ where: { id } })`, which would
let one tenant read another's row by guessing a UUID. This is the single
most important rule in the schema; the concurrency test suite asserts it.

## Indexes (why each exists)

Base composite indexes carry the app's hot paths — all lead with
`businessId` because every query is tenant-scoped:

- `products [businessId, deletedAt]`, unique `[businessId, sku]`,
  `[businessId, barcode]` — listing, dedupe, barcode-first POS lookup.
- `sales [businessId, createdAt]`, `sale_items [saleId]` — reports and
  invoice rendering.
- `inventory_movements [businessId, createdAt]` — the ledger scans.
- `customers/suppliers [businessId, deletedAt]` — party lists.

Step 13 added three that profiling flagged (see PERFORMANCE.md):

```sql
CREATE INDEX idx_movements_biz_type_created
  ON inventory_movements ("businessId", type, "createdAt");   -- velocity/reorder
CREATE INDEX idx_sale_payments_created
  ON sale_payments ("createdAt");                             -- cash-drawer by method
CREATE INDEX idx_expenses_biz_supplier
  ON expenses ("businessId", "supplierId") WHERE "deletedAt" IS NULL;
```

## Query strategies (the ones worth knowing)

- **Financial reports read snapshots only.** Revenue/COGS come from
  `sale_items.unitPrice/unitCost` and `purchase_items.unitCost`, never
  from `products.buyingPrice` (that appears only in *current* inventory
  valuation). Returns are handled inline: each line contributes
  `(quantity − returnedQuantity)/quantity × total`.
- **One pass per fact table, run in parallel.** The financial summary is
  six `Promise.all` aggregates, not a loop; trends use `generate_series`
  so charts have no gaps; previous-period deltas run the same aggregate
  twice with a shifted range.
- **Half-open ranges everywhere** (`>= from AND < to`) — no double
  counting on period boundaries.
- **Atomic stock guard, no read-then-write.** Sales and supplier returns
  decrement with `updateMany({ where: { quantity: { gte: n } } })` and
  check `count === 0` — the DB arbitrates concurrency, not the app.

## Migrations

- Prisma Migrate. One migration per PR, reviewed like code.
- **Expansive-only in the deploy path**: add columns/tables/indexes;
  never drop or rename in the same release that ships code depending on
  the change. Destructive changes are a two-deploy dance (ship code that
  tolerates both shapes → migrate → remove the old shape next release).
  This is what makes the instant Vercel rollback safe (see CI/CD).
- Production runs `prisma migrate deploy` in the Build Command before
  `next build`, so a deploy that can't migrate never goes live.
- New indexes on large tables: create `CONCURRENTLY` in a manual SQL
  migration to avoid write locks.

## Scale posture (when a single Postgres isn't enough)

Everything is already keyed by `businessId`, so the escape hatch is
**tenant sharding**: route a business to a shard by a hash of its id, keep
the schema identical, and the service layer barely changes (the tenant
context already carries the business). Until then: read replicas for
report-heavy load, and `pg_stat_statements` to find the next index. No
application rewrite is on the critical path — that's the payoff of the
tenant-scoping discipline.
