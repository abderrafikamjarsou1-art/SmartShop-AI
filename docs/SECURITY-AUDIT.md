# PHASE 1 — SECURITY AUDIT

Scope: every module from Steps 1–12. Method: threat-model per layer
(auth → tenancy → actions → routes → storage → third parties), then a
pass over each documented risk class. Every finding lists severity,
the vulnerable code, and the fix (concrete fixes live in /fixes).

## Findings summary

| # | Area | Severity | Status |
|---|------|----------|--------|
| S1 | Storage: cross-tenant image deletion | HIGH | FIXED (fixes/storage-policies.sql) |
| S2 | Receipts bucket public | HIGH | FIXED (private + signed URLs) |
| S3 | AI chat POST route lacks origin check (CSRF) | MEDIUM | FIXED (fixes/origin-check patch) |
| S4 | Serializable tx without retry (sales) | MEDIUM | FIXED (fixes/with-retry.ts) |
| S5 | No rate limit on auth actions | MEDIUM | FIXED (fixes/rate-limit.ts) |
| S6 | Upload validation client-side only | MEDIUM | FIXED (bucket constraints) |
| S7 | Missing security headers | MEDIUM | FIXED (fixes/next.config.patch.md) |
| S8 | getCurrentUser writes on every request | LOW (abuse vector) | FIXED (perf fix doubles as write-amplification fix) |
| S9 | Impersonation lacks a visible banner | LOW | FIXED (shell banner patch) |
| S10 | Number sequences rely on retry-less max+1 | LOW | FIXED (S4 retry + unique backstop) |

## Verified-safe (audited, no change needed)

- **Authentication**: middleware validates JWTs with `getUser()` (server-
  verified), never `getSession()`. Session refresh on every request.
  Open-redirect guards on `next` params in login/callback/confirm.
  Forgot-password never reveals account existence.
- **Authorization/RBAC**: single `hasPermission()` source; nav, actions
  and AI tools all read the same map — verified no action calls a
  service without `requireRole`/`requireBusiness`/`requireSuperAdmin`.
- **Tenant isolation**: every service query begins `businessId: ctx.businessId`;
  lookups are `findFirst({id, businessId})`, never `findUnique(id)`.
  Composite uniques are tenant-scoped. AI tool args are `.strip()`ed —
  injected businessId is discarded (tested in Step 11).
- **SQL injection**: all `$queryRaw` use tagged-template parameters;
  sort fields are Zod enum whitelists. Grep audit: zero string-built SQL.
- **XSS**: React auto-escaping everywhere; ReactMarkdown WITHOUT
  rehype-raw (raw HTML in AI output is rendered as text); chart specs
  parsed with strict shape checks and hard caps.
- **CSRF**: Server Actions get Next.js built-in origin enforcement.
  Mutating route handlers: Stripe webhook is signature-verified (not
  cookie-authed, so CSRF-irrelevant); AI chat POST was the gap → S3.
- **Prompt injection**: registry validates/strips args; permissions are
  filtered from tool DEFINITIONS per role; system prompt marks tool
  output as data; forecast numbers are computed, not generated.
- **Replay protection**: sales `clientRef` unique, receiving
  `PurchaseReceipt` unique, webhooks `WebhookEvent` unique — all
  DB-constraint-backed, not just application checks.
- **Webhook verification**: raw-body `constructEvent` before any parse;
  failed handlers release the idempotency row so retries can re-process.
- **Secrets**: service-role key never imported anywhere (grep-verified);
  all Stripe/OpenAI/Resend calls behind `server-only` modules; `.env`
  git-ignored; price IDs in env for test/live swap.
- **Sensitive logs**: prod logs are structured JSON without request
  bodies; Prisma query logging dev-only; webhook logs event ids, never
  payloads; tool errors return messages only (stack stays server-side —
  tested in Step 11).
- **Cookies**: business selection, impersonation httpOnly+secure+lax;
  impersonation capped at 1h and audited both directions.

## Finding details & fixes

### S1 — Cross-tenant storage deletion (HIGH)
The Step 5/receipts policies allowed ANY authenticated user to
insert/delete in shared buckets. Object paths are guessable from public
URLs → a hostile tenant could delete another shop's product images.
**Fix**: object keys now start with the businessId
(`{businessId}/{uuid}.webp` — one-line change in the uploaders) and
policies verify membership via `user_businesses` (fixes/storage-policies.sql).
Deletion/insert outside your own tenant folder is rejected by Postgres.

### S2 — Receipts are financial documents (HIGH)
`receipts` was public: anyone with a URL reads purchase receipts.
**Fix**: bucket switched to private; the expense UI reads via
1-hour signed URLs (`createSignedUrl`) generated server-side. SQL +
snippet in fixes/storage-policies.sql.

### S3 — CSRF on /api/ai/chat (MEDIUM)
Route handlers don't get Server-Action origin protection; the endpoint
is cookie-authed and mutating (writes messages, burns quota). A hostile
site could POST cross-origin (no preflight for simple requests is not
guaranteed here, but Content-Type json triggers preflight — the risk is
non-browser + subdomain scenarios; defense-in-depth is cheap).
**Fix**: `assertSameOrigin(request)` helper comparing Origin/Referer
against NEXT_PUBLIC_APP_URL, applied to AI chat POST (and any future
cookie-authed mutating route). fixes/origin-check.ts.

### S4 — Serialization failures crash sales (MEDIUM, reliability-as-security)
Step 7 uses `isolationLevel: "Serializable"` — correct — but Postgres
resolves conflicts by ABORTING one transaction (40001/P2034). Two busy
tills → sporadic 500s → cashier retries → idempotency saves us from
double-writes, but the UX failure is unnecessary.
**Fix**: `withRetry()` wrapper (fixes/with-retry.ts): retries P2034 and
P2002-on-saleNumber up to 3 times with jitter. Applied to sale create,
receive, and number-sequenced creators.

### S5 — Auth brute force (MEDIUM)
Supabase rate-limits its own API, but our login action loops through
our server first; credential-stuffing hammering is our bill and our logs.
**Fix**: fixed-window limiter (fixes/rate-limit.ts) keyed by IP+email on
login/forgot-password: 10/min. In-memory per instance (documented);
swap to Upstash Redis by replacing one Map when horizontal scale demands.

### S6 — Server-side upload validation (MEDIUM)
Browser → Supabase direct uploads mean OUR size/type checks are
bypassable.
**Fix**: bucket-level constraints (Supabase supports per-bucket
`file_size_limit` and `allowed_mime_types`) — enforced by Supabase
regardless of client: products/logos 5MB images-only; receipts 10MB
images+pdf. SQL in fixes/storage-policies.sql.

### S7 — Security headers (MEDIUM)
No CSP/HSTS/nosniff/frame headers were set.
**Fix**: headers() in next.config (fixes/next.config.patch.md):
HSTS, X-Content-Type-Options, X-Frame-Options DENY,
Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy
minimal, and a Report-Only CSP to burn in before enforcing.

### S8/S9/S10 — see fixes/ for the auth-cache patch, the impersonation
banner (amber bar in AppShell when the cookie is present), and the
retry-backed sequence strategy (unique constraint remains the backstop;
retry makes it invisible to users).
