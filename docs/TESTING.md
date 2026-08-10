# PHASE 3 — TESTING & COVERAGE

> **Status (production-hardening-v1.1, 2026-08-06):** `AUDIT_REPORT.md`
> found several claims below didn't match reality. Corrected:
> - **"CI nightly" / "CI on PR" were both false — no CI existed at
>   all.** A CI workflow now exists (`.github/workflows/ci.yml`,
>   `web` + `mobile` jobs) and runs on every push/PR, but it covers
>   **lint, typecheck, unit tests, build, and `prisma validate` only.**
>   It does **not** run the concurrency suite (needs a real Postgres,
>   not provisioned in CI) or Playwright E2E (still can't run — see
>   below) on any schedule. "CI nightly" and pre-release stress/E2E
>   runs remain PLANNED, NOT IMPLEMENTED.
> - **The coverage table below is unverified/aspirational.** No
>   coverage tool is configured anywhere (`vitest.config.ts` has no
>   `coverage` block, and the `test:coverage` script this doc's
>   Commands section references doesn't exist in `package.json`). The
>   percentages have not been measured by any tool run against this
>   codebase — treat them as a target, not a fact, until coverage
>   tooling is actually wired in.
> - **E2E still cannot run as described.** `scripts/seed-e2e.ts` (see
>   below) still doesn't exist, and only `e2e/pos.spec.ts` exists as a
>   physical file — `billing.spec.ts`/`rbac.spec.ts` are `describe`
>   blocks inside it, not separate files.
> - **The test suite itself is healthier than at audit time**: was
>   10/12 files passing, 129/132 tests (billing.test.ts failed to load
>   entirely; 3 AI tests failed to a cache-isolation bug) — now 12/12
>   files, 152/152 tests, both root causes fixed with regression
>   coverage added (see the `test(core)` commit).

## The pyramid (what runs where, and why)

| Layer | Tool | Count | Runs | Guards |
|-------|------|-------|------|--------|
| Pure math | Vitest | 48 tests | every commit, <2s | sale-math, finance formulas, forecast, reorder, CSV, periods |
| Services (mocked Prisma) | Vitest | 74 tests | every commit (now in CI) | tenant scoping, transactions, business rules, RBAC, AI security |
| Concurrency (real Postgres) | Vitest + Docker | 3 invariants | manual only — PLANNED for CI/nightly | stock guard, idempotency, sequences under parallel load |
| E2E | Playwright | 9 flows | manual only — PLANNED for CI, blocked on missing seed script | auth, POS money path, returns, RBAC visibility, plan gates |
| Stress | k6 | 1 scenario | manual only — PLANNED for pre-release | p95 < 400ms on search under 50 VUs |

## Coverage by module (vitest --coverage, statements) — ASPIRATIONAL, NOT MEASURED

No coverage tool is currently configured; these figures are targets
from when this table was written, not output from an actual run.

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
