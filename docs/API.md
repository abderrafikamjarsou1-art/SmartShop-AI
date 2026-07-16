# API

The app is **Server-Actions-first**: mutations go UI → Server Action →
Zod → Service → Prisma, not through REST. Route handlers exist only where
a server action can't: streaming, binary responses, third-party callbacks,
and infra probes. This is the complete list of HTTP endpoints.

Every route resolves auth the same way as actions — `requireRole(...)` /
`requireSuperAdmin()` → the tenant context → the service. None of them
trust a `businessId` from the request body.

## Route handlers

### `POST /api/webhooks/stripe`
Stripe → us. **Unauthenticated by design**, secured by signature.
`constructEvent` verifies the raw body against `STRIPE_WEBHOOK_SECRET`
(a forged request 400s before it's read). Idempotent: the event id is
inserted into `webhook_events` first; a duplicate hits the unique
constraint and returns `{duplicate:true}` 200. Handles the 6 required
events + `trial_will_end`; a failed handler deletes its idempotency row so
Stripe's retry can re-process. Never returns 200 on an unhandled error.

### `GET /api/health`
Infra probe. DB ping + presence of critical env vars. Returns `200 {ok}`
or `503` with which check failed. No auth (used by uptime monitors);
leaks nothing beyond up/down and a component name.

### `POST /api/ai/chat` · `GET /api/ai/chat`
`requireRole("ai:use")`. POST streams the assistant reply as SSE (server
actions can't stream); body `{conversationId, message}`, Zod-validated.
The turn runs through the AI service → tool registry (permission-gated,
tenant-scoped, audited). GET loads a conversation's history for the pane.
Rate-limited (30 user msgs/hr) and feature-gated (`aiAssistant`) inside
the service, not here.

### `GET /api/invoices/[id]/pdf` · `GET /api/purchases/[id]/pdf`
`requireRole` on the relevant permission, then `service.getById(ctx, id)`
— which scopes by `businessId`, so an id from another tenant 404s. Streams
`application/pdf` (pdf-lib), `inline` disposition. Deterministic, no native
deps.

### `GET /api/inventory/export` · `GET /api/reports/export` · `GET /api/contacts/export`
`requireRole` + feature gate per format (`csvExport`/`excelExport`/
`pdfExport`). Query params select `type` and `format` (csv|xlsx|pdf),
Zod-parsed. CSV ships with a BOM (Excel-safe), xlsx via SheetJS, pdf via
pdf-lib. Data comes from the same services the dashboards use.

## Conventions

- **Errors**: `ApiError` subclasses carry `statusCode` + `expose`. Routes
  return `error.message` only when `expose` is true, otherwise a generic
  string; the real error is logged server-side with a request id. No stack
  traces or connection strings ever reach a client.
- **No public/partner API yet.** When one is added, it belongs behind an
  API-key model with its own `apiCalls` quota (the `UsageCounter` metric
  already exists) — not bolted onto these internal routes.
- **Server Actions** aren't listed here (there are ~40 across 10 action
  files); each is a thin `requireRole → zParse → service → revalidate`
  wrapper returning `ActionResult<T>`. See DEVELOPER-GUIDE.md for the
  pattern.
