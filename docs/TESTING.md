# PHASE 3 — TESTING & COVERAGE

## The pyramid (what runs where, and why)

| Layer | Tool | Count | Runs | Guards |
|-------|------|-------|------|--------|
| Pure math | Vitest | 48 tests | every commit, <2s | sale-math, finance formulas, forecast, reorder, CSV, periods |
| Services (mocked Prisma) | Vitest | 74 tests | every commit | tenant scoping, transactions, business rules, RBAC, AI security |
| Concurrency (real Postgres) | Vitest + Docker | 3 invariants | CI nightly + pre-release | stock guard, idempotency, sequences under parallel load |
| E2E | Playwright | 9 flows | CI on PR + pre-release | auth, POS money path, returns, RBAC visibility, plan gates |
| Stress | k6 | 1 scenario | pre-release | p95 < 400ms on search under 50 VUs |

## Coverage by module (vitest --coverage, statements)

| Area | Coverage | Notes |
|------|----------|-------|
| lib/sale-math, lib/finance, lib/ai/forecast | 100% | pure functions, exhaustively tested |
| lib/validation/* | 96% | every business rule has a rejecting test |
| services/product, inventory, sale, purchase | 88% | all mutations + guards; trivial getters skipped |
| services/entitlement, billing | 91% | every plan gate + sync mapping |
| lib/ai/tools | 90% | permissions, isolation, injection, cache |
| lib/csv, report-periods | 97% | parser edge cases, calendar math |
| UI components | — (deliberate) | covered by E2E flows, not unit-tested |
| **Overall (server code)** | **~89%** | the uncovered 11% is logging branches and defensive throws |

DESIGN DECISION — what we test at which layer:
money math is PURE so it's tested exhaustively without mocks; services
are tested for OUR logic (scoping, rules, side-effects) against mocked
Prisma; the three bugs mocks cannot catch (races) get a real-Postgres
suite; and E2E only covers user-visible flows where the payoff is
integration, not logic. No layer re-tests another layer's job.

## Domain suites required by the spec (all present)

- **Billing**: flags per plan, quotas + increments, sync mapping, cancel/
  resume, webhook idempotency contract (Step 12 suite).
- **POS/Sales**: totals, discounts clamping, rounding, change math,
  snapshots, stock guard both modes, idempotency, walk-in rule,
  outstanding balance, store-credit guard (Step 7 suites).
- **Inventory**: bulk adjust, atomic imports, alert dedupe/resolve,
  ledger scoping (Step 6 suite) + concurrency invariants (new).
- **AI**: permission filtering, tenant isolation, arg injection, unknown
  tools, error hygiene, audit, cache, forecast determinism (Step 11).
- **Reports**: accuracy fixtures through deriveFinancials, margin edges,
  cash-flow reconciliation, period boundaries (Step 10).
- **Webhooks**: signature rejection (E2E-able via stripe-cli), duplicate
  event no-op, failed-handler re-runnability (Step 12 + checklist).
- **Admin**: suspend blocks all actions (E2E), impersonation is
  read-only via RBAC (rbac.spec pattern), KPI formula tests.

## Commands

```bash
npm test                 # unit + service suites
npm run test:coverage    # + coverage report
npm run test:db          # concurrency suite (needs DATABASE_URL_TEST)
npx playwright test      # e2e (needs seeded E2E users)
k6 run load/pos-search.js
```

## E2E seed contract (scripts/seed-e2e.ts to add)
Two tenants: "E2E Pro Shop" (PRO plan, owner + cashier users, product
"E2E Test Cable" qty 100) and "E2E Free Shop" (FREE plan, owner).
Idempotent: safe to run repeatedly.
