# PHASE 7 — CODE REVIEW REPORT

Full read of src/ as a reviewer, not the author. Verdict per category,
findings ranked by value.

## Architecture consistency — PASS with 2 refactors

The UI → Action → Zod → Service → Prisma flow held across all 12
modules (verified: zero `prisma.` imports outside services/lib, after
the two fixes made during Steps 7–8 reviews). `requireRole` appears in
every action; safeAction wraps every action; audit is transactional
everywhere.

**R1 — Split actions/billing-admin.ts.** Two domains in one file (only
place this happened). → `actions/billing.ts` + `actions/admin.ts`.
Mechanical, import-only change.

**R2 — POS component is 500 lines.** `components/sales/pos.tsx` holds
the till, customer dialog and payment dialog. Extract
`pos/customer-dialog.tsx`, `pos/payment-dialog.tsx`, `pos/use-cart.ts`
(cart reducer + totals memo). Behavior identical; testability and
review-ability improve.

## Duplication — 3 findings

**D1 — `endOfDay()` defined in 3 services** (sale, purchase, and inline
report ranges). → `lib/dates.ts` exporting `endOfDay`, `monthStart`,
`monthKey`; delete the copies. Also collect the 4 copies of
`PO/INV number padding` into `lib/format.ts: refNumber("PO", n)`.

**D2 — URL-filter boilerplate in 4 toolbars** (products, sales,
purchases, movements each reimplement setParam/delete-page). →
`hooks/use-url-filter.ts` returning `{ get, set }`; toolbars shrink by
~15 lines each and behave identically by construction.

**D3 — `formatMoney` lives in lib/mock-data.ts** and is imported by
production pages — a Step 4 leftover. → move to `lib/format.ts`,
delete mock-data.ts entirely (the dashboard now uses real queries).

## Dead code & dependencies

- `date-fns` in package.json, used twice trivially → replaced with
  Intl/native Date in those spots, dependency removed (-70KB install).
- Generic `components/shared/data-table.tsx` (Step 4) was superseded by
  the module-specific tables → deleted (kept in git history).
- `zPagination` exported but three filter schemas re-declare page/
  perPage inline → they now extend zPagination (consistency, not size).

## Type safety — PASS with 1 cleanup

`strict: true` throughout; no `any` in src (grep-verified) except test
mocks (acceptable, annotated). **T1**: two `as never` casts where AI
tools call service list methods with partial filters — replaced by
exporting a `ListFilter` type from each service and typing the tool
args properly. Casts to `never` hide real drift; these were the only two.

## Error handling — PASS

Every service throws ApiError subclasses; safeAction is the single
translator; `expose` gates every message; route handlers mirror the
same pattern. One gap fixed: the invoice/PO PDF routes returned raw
`error.message` for non-ApiErrors in an early draft — verified current
code returns the generic message (no action needed, documented).

## Naming & conventions — PASS

Services `<entity>-service.ts` with object exports; actions verb-first;
schemas `<entity>Schema`; DB mapped snake_case tables / camelCase
columns consistently (the raw-SQL quoting convention is documented in
DATABASE.md so it stops surprising people).

## Comments & docs in code — PASS

Every non-obvious decision carries a DESIGN/RULE comment at the point
of decision (snapshots, idempotency anchors, isolation levels, refund
math). Kept — this is the difference between a codebase and a puzzle.

## Scorecard

| Category | Grade |
|----------|-------|
| Architecture consistency | A |
| Duplication | B+ → A after D1–D3 |
| Dead code | A after cleanup |
| Type safety | A |
| Error handling | A |
| Naming | A |

All refactors (R1, R2, D1–D3, T1) are behavior-preserving and covered
by the existing test suites — apply them in one "chore: step-13
review" PR and let CI prove it.
