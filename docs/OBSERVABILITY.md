# PHASE 4 — OBSERVABILITY

## 1. Sentry (errors + performance)

```bash
npx @sentry/wizard@latest -i nextjs
```
The wizard generates `sentry.client/server/edge.config.ts` +
`instrumentation.ts`. Our additions:

```ts
// sentry.server.config.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.2,            // 20% of transactions — enough signal, bounded cost
  profilesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? "development",
  beforeSend(event) {
    // NEVER ship PII/payloads: we keep ids, drop bodies
    delete event.request?.data;
    if (event.request?.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.authorization;
    }
    return event;
  },
});
```

Wire into safeAction (one place = every action reports):
```ts
// in the catch of safeAction, before returning the generic error:
Sentry.captureException(error, { tags: { action: actionName } });
```
And into the webhook + AI route catch blocks the same way.

## 2. Request IDs (correlate logs <-> errors <-> users)

Vercel provides `x-vercel-id` per request. Patch logger.ts:
```ts
import { headers } from "next/headers";
async function requestId() {
  try { return (await headers()).get("x-vercel-id") ?? undefined; }
  catch { return undefined; } // outside request scope (cron, startup)
}
// include { requestId: await requestId() } in the JSON log entry
```
Sentry picks the same header up automatically → one id joins a user
report, the structured logs, and the traced transaction.

## 3. OpenTelemetry

Next.js emits OTel spans natively via `instrumentation.ts`:
```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({ serviceName: "smartshop-ai" });
  }
}
```
Prisma spans: add `previewFeatures = ["tracing"]` to the generator and
`new PrismaClient({ ... })` picks them up — every query appears as a
child span under its action. Export target: Sentry ingests OTel
directly (or point OTEL_EXPORTER_OTLP_ENDPOINT at Grafana/Honeycomb).

## 4. Structured logging — already built (Step 3)

Prod logs are single-line JSON (Vercel log drains parse them). Step 13
adds `requestId` (above) and a `domain` field convention:
`logger.info("sale.completed", { domain: "sales", saleId, total })`.
Drain to Axiom/Datadog with a Vercel Log Drain — zero code.

## 5. Performance monitoring

Three layers, no new code:
- Sentry transactions (20% sampled) — p50/p95 per route + per action tag.
- Vercel Speed Insights (enable in dashboard) — real-user Web Vitals.
- Postgres: `pg_stat_statements` (enabled by default on Supabase) —
  the weekly maintenance task reviews the top-10 by total_exec_time
  (see MAINTENANCE.md).

## 6. Health checks

`/api/health` (built): DB ping + env presence, 200/503. Point
UptimeRobot/BetterStack at it (1-min interval) AND use it as the CI
post-deploy gate (see ci.yml — deploy fails if health fails).

## 7. Audit dashboards

The AuditLog table is the event source; two views ship value now:
- **Admin → audit trail** (built in Step 12): all `admin.*` actions.
- **SQL saved queries** (Supabase dashboard) for security review:
```sql
-- Who did what in a business, last 7 days
SELECT "createdAt", action, entity, u.email
FROM audit_logs a LEFT JOIN users u ON u.id = a."userId"
WHERE a."businessId" = :bid AND a."createdAt" > now() - interval '7 days'
ORDER BY a."createdAt" DESC;

-- AI data-access review (which tools, how often, by whom)
SELECT action, COUNT(*), MAX("createdAt")
FROM audit_logs WHERE action LIKE 'ai.tool.%'
GROUP BY action ORDER BY count DESC;
```
