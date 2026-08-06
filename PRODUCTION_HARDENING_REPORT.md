# Production Hardening Report — v1.1

**Branch:** `production-hardening-v1.1` (off `main` @ `f67da9d`)
**Date:** 2026-08-06
**Scope:** implement the verified critical/high findings from
`AUDIT_REPORT.md` — no new features, no unrelated file changes.
**Rule followed throughout:** every claim below was produced by
actually running the command shown, not by inference.

## Commits on this branch

```
e5aa9cd fix(security): wire rate limiting and origin protection
56737b0 fix(tooling): restore lint and resolve eslint findings
383eefb test(core): repair billing and AI regression coverage
dbc73ce fix(deps): address verified security advisories
00df9cd ci: add production validation workflow
cd10089 docs: align operational documentation with reality
```
(A 7th commit, `docs(hardening): ...`, follows this file.)

## 1. Security: rate limiting + CSRF (commit `e5aa9cd`)

**Before:** `src/lib/rate-limit.ts` had a fully working
`assertRateLimit()` and `assertSameOrigin()`, imported **nowhere** in
`src/`. Login/register were fully open to brute force; AI chat had no
CSRF guard.

**After:**
- `assertRateLimit` wired into: web login, web register, web
  forgot-password, web reset-password (`src/actions/auth.ts`), and the
  mobile bearer-token `/api/auth/login` + `/api/auth/register` routes.
  Keys combine client IP (new `getClientIp()` helper) with the
  submitted email where relevant.
- `assertSameOrigin` wired into `POST /api/ai/chat` — the one
  cookie-authenticated mutating route handler that needed it — with an
  explicit bypass for bearer-token (mobile) requests, which never send
  Origin/Referer and have no cookie session to forge.
- **Not present in this codebase at all, confirmed by search:** a
  "resend verification" endpoint and a token-refresh endpoint. Nothing
  to wire there — not invented, per scope.

## 2. Tooling: lint (commit `56737b0`)

**Before:** `npm run lint` → `next lint` → immediate error ("Invalid
project directory... /lint") because **Next.js 16 removed the `next
lint` subcommand entirely.** The 52 real ESLint errors + 3 warnings in
the tree had never actually been caught by this script.

**After:** `"lint": "eslint ."`, using the flat config that already
existed (`eslint.config.mjs`). Also excluded `android/**` — a generated
Capacitor/Gradle build directory (confirmed via its own gitignore and
"Generated File. Do not edit." header) that was surfacing 14 unrelated
errors from a stray build artifact.

All 52 errors + 3 warnings fixed for real — no rule weakened, no file
disabled, no `eslint-disable` added except one narrow, commented,
single-line case in AI test files that pre-existed this pass (`// eslint-disable-next-line @typescript-eslint/no-explicit-any` on a
`prisma as any` test cast, the established pattern already used by
`sale-service.test.ts`). Notable fixes:
- 14× `no-unused-expressions` (`r.success ? toast.success() :
  toast.error()` used as a statement) rewritten as `if`/`else`.
- `src/lib/ai/tools.ts`'s one `any` (`TOOLS: ToolDef<any>[]`) replaced
  with a type-safe erase-at-the-boundary pattern in the `tool()`
  helper — `ToolDef<S>` is invariant in `S`, so a heterogeneous array
  structurally can't be `ToolDef<ConcreteSchema>[]`; the fix erases to
  the common bound at one contained call site instead of using `any`.
- `mobile/app/_layout.tsx`'s one `require()` converted to an ES import
  (added `mobile/types/assets.d.ts` for the `.ttf` module type Metro
  needs).

## 3. Tests (commit `383eefb`)

| | Before | After |
|---|---|---|
| Test files | 10/12 passing | **12/12 passing** |
| Tests | 129/132 passing | **152/152 passing** |

- `billing.test.ts`: root cause was a Vitest hoisting violation (`const
  db` at module scope, referenced from inside `vi.mock()`'s factory —
  vi.mock is hoisted above top-level const, so it ran before `db`
  existed). Fixed by building the mock inside the factory, the same
  pattern already correct in `sale-service.test.ts`/`contacts.test.ts`.
  Also fixed a fixture bug the audit flagged as a side effect of the
  suite never running: `current_period_end` was nested under
  `items.data[0]` in the test fixture, but `billing-service.ts:151`
  reads it at the subscription's top level — moved it to match
  production and added a dedicated regression test.
- `ai.test.ts`: root cause was the tool-result cache (a module-level
  `Map`, 60s TTL) never being reset between tests — the first test in
  a block would poison the cache for the next three. Exported
  `_clearToolCacheForTests()`, called in `beforeEach`. That isolation
  fix exposed (and let us fix) two real bugs it had been masking in
  `src/lib/ai/tools.ts`:
  - Cache hits skipped audit logging entirely — a repeated identical
    AI tool call was silently unaudited. Restructured so every
    successful call is audited, cache hit or not, with a `cached` flag
    in the metadata.
  - Tool errors returned the raw exception message (`e.message`)
    straight to the model/user — a rejected call with e.g. `"connect
    ECONNREFUSED 10.0.0.5:5432"` would have shipped that string into
    the chat response. Now returns a fixed generic message; the real
    error still goes to `logger.warn` server-side only.
  - Regression tests added for both.

## 4. Prisma migration state (see `MIGRATION_RECONCILIATION_PLAN.md`)

**Not resolved — deliberately.** `prisma migrate status` (from the
original audit) shows both migrations as unapplied against the
connected database. Reading the migration files (read-only, no DB
connection) strongly suggests this is a bookkeeping gap, not a missing
schema — `00000000000000_init` is a hand-authored baseline migration
whose own header comment says to check `migrate status` before doing
anything with it. But confirming that requires one live, read-only
query this session did not run (a database-inspection script failed on
a module-resolution issue and was not retried, per direction). The
full plan, both possible scenarios, and the exact commands for each are
in `MIGRATION_RECONCILIATION_PLAN.md` — **nothing runs against the live
database without explicit sign-off first.**

## 5. Dependencies (commit `dbc73ce`, full detail in `SECURITY_ADVISORY_STATUS.md`)

| | Before | After |
|---|---|---|
| Root `npm audit` | 11 (1 critical, 6 high, 4 moderate) | **1 (high — xlsx, no fix available)** |

`next`→16.3.0, `postcss`/`sharp`/`tar`/`brace-expansion` resolved via
`npm audit fix` (no `--force`), `vitest`→4.1.10 (the one genuine major
bump, explicitly in scope, verified against the full 152-test suite).
`xlsx` has no upstream fix; confirmed by reading every call site that
this codebase only ever writes xlsx files from trusted DB rows, never
parses untrusted ones — the vulnerable code path is unreachable today.

## 6. CI (commit `00df9cd`)

**Before:** no `.github/workflows/` directory existed at all.

**After:** `.github/workflows/ci.yml` — `web` job (npm ci, lint,
typecheck, test, build, prisma validate) + `mobile` job (npm ci, tsc
--noEmit), on every push to `main` and every PR.

**Known limitation:** the `mobile` job will fail on GitHub today
because `mobile/` is still untracked, pre-existing work that predates
this hardening pass — see §8.

## 7. Documentation (commit `cd10089`)

Added dated status callouts to `docs/SECURITY-AUDIT.md`,
`docs/OBSERVABILITY.md`, `docs/BACKUPS-DR.md`, `docs/TESTING.md`, and
`docs/FINAL-REPORT.md` — each states plainly what's actually
implemented vs. planned vs. externally configured, without deleting
the original content. Full detail in the commit itself.

## 8. What was explicitly out of scope / not touched

- The pre-existing, uncommitted mobile-auth-bridge work (`mobile/`,
  `android/`, `capacitor.config.ts`, `src/lib/auth-bearer.ts`,
  `src/lib/require-api-auth.ts`, `src/app/api/auth/*`'s original
  content, and the pre-existing diffs in `package.json`,
  `package-lock.json`, `prisma/schema.prisma`, `src/lib/auth.ts`,
  `tsconfig.json`, `e2e/pos.spec.ts`) — per explicit instruction, none
  of it was staged or committed as a "cleanup" step. Where a fix
  genuinely required editing one of these files (rate-limiting the
  mobile auth routes; the `vitest` line in `package.json`), only that
  specific change was staged — verified file-by-file via `git diff
  --cached` before every commit in this branch, and hunk-by-hunk via
  `git add -p` for `package.json` specifically.
  `package-lock.json` is the one exception that couldn't be surgically
  split (a lockfile reflects the whole `package.json`, not a subset) —
  disclosed explicitly in the `fix(deps)` commit message.
- Expo/mobile npm audit findings (12 moderate + 1 high) — a different,
  larger job (an Expo SDK line bump), not a "targeted compatible
  update"; documented, not fixed, in `SECURITY_ADVISORY_STATUS.md` §3.
- Concurrency test suite and Playwright E2E were not added to CI —
  concurrency needs a real Postgres not provisioned in the CI job;
  E2E's own seed script (`scripts/seed-e2e.ts`) still doesn't exist.
  Both were already-known gaps from `AUDIT_REPORT.md`, not introduced
  or worsened here.
- No source-code security findings beyond the two explicitly requested
  (rate limiting, CSRF) were fixed — S1, S2, S4, S6–S10 in
  `docs/SECURITY-AUDIT.md` were not re-verified in this pass; the docs
  commit says so explicitly rather than implying a full re-audit.

## 9. Full validation, run immediately before this report was written

```
npm run lint        -> 0 errors, 0 warnings (exit 0)
tsc --noEmit         -> clean (exit 0)
vitest run           -> 12/12 files, 152/152 tests (exit 0)
npm run build        -> succeeds, 38 routes (exit 0)
npx prisma validate  -> "The schema at prisma/schema.prisma is valid" (exit 0)
cd mobile && tsc --noEmit -> clean (exit 0)
npm audit --json     -> 1 vulnerability (high, xlsx, no fix available)
```

See `CHANGELOG_V1.1_HARDENING.md` for the itemized before/after and
remaining-blocker summary in changelog form.
