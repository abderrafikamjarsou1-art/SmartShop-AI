# ARCHITECTURE

## The one diagram

```
Browser (React 19 / Next.js 15 App Router)
   │  Server Components (reads)        │  Server Actions (writes)
   ▼                                   ▼
requireBusiness()/requireRole() ─── safeAction() wrapper
   │                                   │  zParse(schema) — Zod
   ▼                                   ▼
            SERVICE LAYER  (src/services/*)
   • the ONLY place business rules live
   • first param is always TenantContext
   • entitlementService gates plan features/quotas here
   ▼
Prisma (transactions, snapshots, guards) ──► Supabase Postgres
```

Side doors that follow the same spine:
- **Route handlers** (`/api/*`) exist only where actions can't work:
  streaming (AI chat SSE), binary output (PDF/exports), external callers
  (Stripe webhook, health). Each starts with the same auth gate.
- **The AI** is an untrusted client: model → tool registry (permission +
  Zod + audit) → services. It never sees Prisma.

## Non-negotiable invariants

1. **Tenancy**: every service method takes `TenantContext` first; every
   query is scoped by `ctx.businessId` (`findFirst` with businessId,
   never `findUnique` by id alone). Cross-tenant access is a query-shape
   impossibility, not a policy.
2. **Immutable money**: financial numbers come ONLY from snapshots —
   `SaleItem.unitPrice/unitCost`, `PurchaseItem.unitCost` — written at
   transaction time. Editing a product price never rewrites history.
3. **Ledger**: `InventoryMovement` is append-only with signed quantities
   and before/after; stock truth is replayable.
4. **Idempotency by unique constraint**: POS sales (`Sale.clientRef`),
   receiving (`PurchaseReceipt`), webhooks (`WebhookEvent`) — replays
   collide with a unique index and become no-ops.
5. **Guards over read-then-write**: stock and store-credit checks are
   atomic `updateMany ... WHERE quantity >= n` — no TOCTOU races.
6. **Errors**: `ApiError` hierarchy with `expose` flag; `safeAction`
   converts to `ActionResult<T>`; users see safe messages, logs see truth.

## Module map (12)

| Module | Service(s) | Notable design |
|---|---|---|
| Auth & tenancy | lib/auth, lib/tenant | Supabase SSR, JIT user upsert, active-business cookie, RBAC (5 roles → permission sets) |
| App shell | — | Server layouts, role-filtered nav |
| Products | product-service | Reference module; image pipeline → Storage |
| Inventory | inventory-service, stock-alerts | Ledger analytics, CSV import, alert dedupe |
| POS/Sales | sale-service + lib/sale-math (pure) | Split payments, returns at effective rate, invoice PDFs |
| Purchases | purchase-service | Receipt-event idempotency, cost history |
| Contacts | customer-service, supplier-service | FIFO payment allocation, merged timelines |
| Expenses | expense-service | Recurring templates → materialized instances |
| Reports | report-service + lib/finance (pure) | Snapshot-only aggregates, 4 dashboards |
| AI copilot | ai-service + lib/ai/* | Tool registry, deterministic forecasts, cost control |
| Billing | billing/entitlement-service | Stripe one-way sync, enforcement in services |
| Admin | admin-service | Platform KPIs, read-only impersonation via EMPLOYEE role |

## Patterns to copy when extending

- New module = validation file + service + 3-line actions + pages.
- Pure math goes in `lib/*` with direct unit tests (sale-math, finance,
  forecast) — services stay thin over IO.
- Anything countable is counted from its table, not maintained as a
  counter (quotas, rate limits) — counts can't drift.
