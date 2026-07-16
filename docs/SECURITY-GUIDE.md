# SECURITY GUIDE

SECURITY-AUDIT.md is the point-in-time review (findings S1–S10 and their
fixes). This is the *standing* guide: the invariants to preserve and the
routine practices that keep them true.

## The five invariants (never regress these)

1. **Tenant isolation.** Every business-owned query filters by
   `ctx.businessId`; single-row reads use `findFirst({ id, businessId })`,
   never `findUnique({ id })`. A new query that skips this is a
   cross-tenant leak. The concurrency suite guards it; code review must
   too.
2. **Enforcement lives in services.** `requireRole`, `requireFeature`,
   `requireQuota` are called in services/actions — never as the only check
   in the UI. Graying out a button is UX; the service call is the boundary.
3. **The AI is an untrusted client.** It reaches data only through the
   tool registry, which re-checks permission + tenant on every call and
   strips unknown args (so an injected `businessId` is discarded). Never
   give the model a service or Prisma handle directly.
4. **Money math from snapshots.** Reports read `SaleItem`/`PurchaseItem`
   snapshots, never live product prices. This is a correctness *and*
   integrity property — a repriced product can't rewrite history.
5. **Webhooks: verify then dedupe.** Signature check on the raw body,
   idempotency row first. Both, always, for any new webhook source.

## Authn / authz

- Supabase Auth; the server reads the user via `getUser()` (verifies the
  JWT), **never** `getSession()` (trusts a cookie). Middleware guards
  protected route prefixes and blocks open redirects.
- RBAC is a role→permission-set map (`OWNER > ADMIN > MANAGER > CASHIER >
  EMPLOYEE`). Permissions are checked, not roles — add a permission to the
  map, not an `if role === ...` at a call site.
- Super-admin impersonation resolves to the **EMPLOYEE** (read-only) role,
  so existing permission checks block writes with no separate "admin mode"
  code path. Time-boxed (1h cookie), audited start/stop.

## Input & output

- All external input (action args, route bodies, query params, CSV rows,
  tool args) is Zod-parsed before use — this is the SQL-injection and
  type-confusion boundary. Raw SQL uses parameterized `$queryRaw` tagged
  templates only; never string-concatenate a value in.
- React escapes by default (XSS); the one place raw HTML is rendered is
  AI markdown, which goes through `react-markdown` (no `dangerouslySet…`).
  The AI's `chart` blocks are parsed defensively and dropped if malformed.
- Errors expose `message` only when `expose` is true; everything else is a
  generic string with the detail logged server-side under a request id.

## Secrets & logging

- Secret-handling rules live in ENV-VARS.md. The short version: server
  secrets are never `NEXT_PUBLIC_`, live in Vercel's encrypted store, and
  rotate by redeploy.
- Structured logs scrub PII in Sentry's `beforeSend`; never log full
  request bodies, tokens, card data, or connection strings. `audit_logs`
  is the deliberate record of who-did-what — use it, don't reinvent it in
  app logs.

## Routine cadence

- **Weekly**: skim `audit_logs` for `admin.*` and any spike in
  `ai.tool.*`; check Sentry's top issues.
- **On every PR**: does it add a query without `businessId`? an action
  without `requireRole`? a webhook without signature+idempotency? a
  `NEXT_PUBLIC_` on something secret? Those four questions catch most
  regressions.
- **Monthly**: `npm audit` / Dependabot review; rotate nothing on schedule
  but confirm no secret has leaked into logs or git history.
- **On incident**: rotate the Stripe webhook secret and Supabase
  service-role key first; they're the highest-leverage credentials.

## Reporting

Security issues go to a private channel (e.g. security@yourdomain.com), not
public issues. Triage against the five invariants above — most real bugs
are a regression of one of them.
