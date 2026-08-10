# Security Advisory Status

**As of production-hardening-v1.1, 2026-08-06.** Source: `npm audit`
run against this repo, before and after the `fix(deps)` commit. No
`npm audit fix --force` was used; no unrelated major upgrades were
performed beyond what a genuine fix required.

## Summary

| | Before (AUDIT_REPORT.md) | After (this pass) |
|---|---|---|
| Root project | 11 advisories (1 critical, 6 high, 4 moderate) | **1 advisory (1 high — xlsx, no fix available)** |
| Mobile (`mobile/`) | 13 advisories (1 high, 12 moderate) | 13 advisories — **out of scope, see §3** |

## 1. Resolved

| Package | Was | Now | Severity | How |
|---|---|---|---|---|
| `next` | 16.2.10 | 16.3.0 | high | Resolved within the existing `^16.2.10` range — no `package.json` change needed; the Server Action SSRF, cache-confusion, and unauthenticated-internal-endpoint-disclosure CVEs are all fixed in 16.3.0. |
| `postcss` | 8.4.31 / 8.5.18 (two transitive copies) | 8.5.23 | high | Transitive-only (not a direct dependency); `npm audit fix` re-resolved both copies to the patched version. |
| `sharp` | 0.34.5 | 0.35.3 | high | Transitive via `next`'s optional image-processing dependency; re-resolved automatically once `next` moved. |
| `tar` | ≤7.5.20 | 7.5.22 | moderate | Transitive; re-resolved. |
| `brace-expansion` | 1.1.16 / 2.1.2 / 5.0.7 (three separate transitive copies, three different major lines) | 1.1.18 / 2.1.4 / 5.0.9 | high | Each copy individually vulnerable under a different clause of the advisory's affected-range list; `npm audit fix` resolved all three independently without touching any parent package's declared version. |
| `vitest` (+ `vite`, `esbuild`, `vite-node`, `@vitest/mocker`) | 2.1.8 chain | **4.1.10 chain** | critical (vitest itself) | The one genuine major-version bump in this pass — no non-major fix exists; every advisory in this chain is only patched in the vitest 4 line. Verified safe: `vitest.config.ts` used only stable APIs unaffected across the bump (no coverage config, no snapshot config). Full suite re-run: 152/152 tests pass, same 12/12 files, before and after. |

## 2. Not resolved — `xlsx` (high, no upstream fix)

Two advisories, both unpatched by SheetJS upstream as of this pass:

- **Prototype Pollution** — [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
- **ReDoS** — [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)

`npm audit fix` (with or without `--force`) reports `fixAvailable:
false` for this package — there is no patched version to move to and
no `overrides` target that resolves it, since it's a direct dependency
at its latest published version.

### Reachable risk assessment (verified by reading every call site)

```
$ grep -rln "from \"xlsx\"" src/
src/app/api/contacts/export/route.ts
src/app/api/inventory/export/route.ts
src/app/api/reports/export/route.ts
```

All three call sites use exactly this pattern:
```ts
const sheet = XLSX.utils.json_to_sheet(rows);       // rows = our own DB query results
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, type);
const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
```

Both published CVEs live in SheetJS's **parsing** code path (malicious
cell content or crafted file structure processed during `XLSX.read()`
/ `XLSX.readFile()`). A repo-wide search confirms **neither of those
functions is called anywhere in this codebase** — `xlsx` is used
exclusively to *write* export files built from data that already came
out of our own, already-validated Postgres tables. There is no code
path today where an attacker-controlled file or cell value reaches
SheetJS's parser.

**Practical exploitability right now: none.** The package is flagged
high-severity in the abstract, but the vulnerable path is unreachable
in this application as built.

### Mitigation

1. **No action required for current functionality** — the write-only
   usage pattern is not exposed to either CVE.
2. **Guardrail for future work:** if an XLSX *import* feature is ever
   added (e.g., bulk product upload via spreadsheet, mirroring the
   existing CSV import in `src/components/inventory/import-dialog.tsx`),
   this advisory must be re-assessed *before* shipping it — that
   feature would call `XLSX.read()`/`readFile()` and immediately
   become reachable. At that point, evaluate `exceljs` (actively
   maintained, no equivalent open advisory as of this writing) as a
   replacement, or vendor a patched fork.
3. **Track upstream:** re-run `npm audit` periodically; SheetJS may
   ship a fix, at which point this becomes a normal version bump.

## 3. Mobile (`mobile/`) — explicitly out of scope for this pass

`npm audit` in `mobile/` reports 13 advisories (1 high — the same
`brace-expansion` issue, transitively; 12 moderate — `@expo/cli`,
`@expo/config`, `@expo/config-plugins`, `@expo/inline-modules`,
`@expo/local-build-cache-provider`, `@expo/metro-config`,
`@expo/prebuild-config`, `expo`, `expo-splash-screen`, `postcss`,
`uuid`, `xcode`).

**Not addressed in this pass** — the task scope named six specific
root-project packages (Next.js, Vitest/Vite, Sharp, PostCSS,
brace-expansion, xlsx); Expo tooling was not in that list, and fixing
it is a materially different, larger job: `npm audit fix`'s suggested
target for several of these is `expo@46.0.21` — a *downgrade* from the
currently installed Expo SDK 57, which is npm's dependency resolver
finding *a* version that satisfies some other package's constraint, not
a real upgrade path. Actually resolving these safely means bumping the
whole Expo SDK line (57 → 58+) deliberately, with its own compatibility
testing — a separate, scoped piece of work, not a "targeted compatible
update." Flagged here so it isn't lost, not fixed here so it isn't
rushed.

## 4. Verification

```
$ npm audit --json   (root, after this pass)
{"info":0,"low":0,"moderate":0,"high":1,"critical":0,"total":1}
```
The single remaining advisory is `xlsx`, addressed in §2 above.
