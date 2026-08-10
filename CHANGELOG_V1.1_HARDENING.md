# Changelog — production-hardening-v1.1

Source: `AUDIT_REPORT.md` (2026-08-06 read-only audit). Full narrative
in `PRODUCTION_HARDENING_REPORT.md`; dependency detail in
`SECURITY_ADVISORY_STATUS.md`; migration state in
`MIGRATION_RECONCILIATION_PLAN.md`.

## Fixed

- **security:** rate limiting wired into web login/register/forgot-password/
  reset-password and mobile bearer-token login/register; CSRF origin
  check wired into the AI chat POST route. Both mechanisms existed in
  code but were imported nowhere before this pass.
- **tooling:** `npm run lint` was broken (Next.js 16 removed `next
  lint`); repointed at ESLint directly. All 52 pre-existing lint errors
  + 3 warnings fixed without disabling any rule.
- **tests:** `billing.test.ts` fixed a Vitest hoisting bug that made 18
  tests silently never run; `ai.test.ts` fixed a cache-isolation bug
  that made 3 tests fail and was masking two real bugs (cache hits
  skipped audit logging; tool errors leaked raw exception messages).
  Both underlying bugs fixed, both fixes covered by new regression
  tests.
- **dependencies:** 10 of 11 root npm audit advisories resolved
  (next, postcss, sharp, tar, brace-expansion, vitest/vite/esbuild
  chain). `xlsx`'s one remaining advisory has no upstream fix;
  confirmed unreachable in this codebase's actual usage (write-only,
  never parses untrusted input).

## Added

- `.github/workflows/ci.yml` — lint, typecheck, test, build, prisma
  validate, mobile typecheck on every push/PR. No CI existed before.
- `mobile/types/assets.d.ts` — module declaration needed after
  converting one `require()` font import to an ES import.
- Regression tests: AI tool cache-hit audit logging, AI tool safe-error
  message, billing `current_period_end` field mapping.
- `AUDIT_REPORT.md`/`AUDIT_REPORT.json` (prior turn), this file,
  `PRODUCTION_HARDENING_REPORT.md`, `MIGRATION_RECONCILIATION_PLAN.md`,
  `SECURITY_ADVISORY_STATUS.md`.

## Documented, not fixed (by design)

- **docs/SECURITY-AUDIT.md, docs/OBSERVABILITY.md, docs/BACKUPS-DR.md,
  docs/TESTING.md, docs/FINAL-REPORT.md** — status callouts added
  distinguishing implemented vs. planned vs. externally configured.
  Nothing deleted.
- **Prisma migration state** — 2 migrations still show as unapplied
  against the connected database. Root cause investigated and a full
  plan written (`MIGRATION_RECONCILIATION_PLAN.md`); no command run
  against the live database — needs one read-only inspection query and
  a human decision before anything executes.
- **`xlsx` advisory** — no fix exists upstream; risk assessed as
  currently unreachable, with a guardrail documented for if/when an
  import-from-spreadsheet feature is ever added.
- **Mobile (Expo) npm audit findings** (13 advisories) — out of scope;
  the available "fix" is a downgrade artifact of npm's resolver, not a
  real patch; a genuine fix means a deliberate Expo SDK version bump,
  a separate piece of work.

## Test/quality metrics

| Metric | Before | After |
|---|---|---|
| `npm run lint` | broken script (didn't run) | 0 errors, 0 warnings |
| Direct `eslint .` | 52 errors, 3 warnings | 0 errors, 0 warnings |
| `tsc --noEmit` | clean | clean |
| Vitest files | 10/12 passing | 12/12 passing |
| Vitest tests | 129/132 passing | 152/152 passing |
| `next build` | succeeds | succeeds |
| `prisma validate` | valid | valid |
| Prisma migrations pending | 2 | 2 (unchanged — see plan doc) |
| Root `npm audit` | 11 (1 crit, 6 high, 4 mod) | 1 (high) |
| Mobile `npm audit` | 13 (1 high, 12 mod) | 13 (unchanged — out of scope) |
| CI workflow | none | `.github/workflows/ci.yml` (web + mobile jobs) |

## Remaining blockers before this branch should be considered production-ready

1. Migration reconciliation decision (`MIGRATION_RECONCILIATION_PLAN.md`)
   — needs a live read-only check and a human sign-off.
2. The CI `mobile` job will fail until `mobile/`/`android/` (currently
   untracked, pre-existing work) are actually committed.
3. Sentry/error-tracking, automated offsite backups, nightly concurrency
   runs, and E2E-in-CI remain unimplemented (now honestly documented as
   planned, not claimed as done).
4. `xlsx`'s advisory has no upstream fix — monitor, and re-assess before
   ever adding a parse/import feature for spreadsheets.
5. S1, S2, S4, S6–S10 in `docs/SECURITY-AUDIT.md` were not re-verified
   in this pass.
