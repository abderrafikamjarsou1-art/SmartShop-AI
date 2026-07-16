# DEVELOPER GUIDE

## Local setup (15 minutes)

```bash
git clone <repo> && cd smartshop-ai
npm install
cp .env.example .env.local          # fill: Supabase, Stripe TEST, OpenAI
npx prisma migrate dev              # creates schema on your dev DB
npm run dev                         # http://localhost:3000
stripe listen --forward-to localhost:3000/api/webhooks/stripe  # billing dev
```

Supabase local (optional): `npx supabase start` and point the env at the
local URLs. Storage buckets: create `logos`, `products`, `receipts` and
run `fixes/storage-policies.sql`.

## Commands

| Command | What |
|---|---|
| `npm run dev` | dev server (Turbopack) |
| `npm run build && npm start` | production build check |
| `npm test` | vitest unit/service suites |
| `npm run test:coverage` | coverage report (CI gates at 85% on services/lib) |
| `npm run test:integration` | real-Postgres concurrency invariants (needs DATABASE_URL) |
| `npx playwright test` | E2E (needs a seeded run target) |
| `npx prisma studio` | data browser |
| `npm run lint` / `npx tsc --noEmit` | lint / typecheck |

## How to add a feature (the golden path)

1. **Schema** — edit `prisma/schema.prisma`; expansive changes only
   (add columns/tables; drop in a later release). `npx prisma migrate dev -n "..."`.
2. **Validation** — `src/lib/validation/<module>.ts`: Zod schemas, export
   inferred types. Coerce numbers, bound strings, whitelist enums/sort keys.
3. **Service** — `src/services/<module>-service.ts`:
   - method signature: `(ctx: TenantContext, input: XInput)`
   - every read scoped by `ctx.businessId`; every multi-write in
     `prisma.$transaction` with `audit(tx, ctx, ...)`
   - plan gates: `entitlementService.requireQuota/requireFeature` at the top
4. **Action** — `src/actions/<module>.ts`, exactly this shape:
   ```ts
   export async function createThing(input: unknown): Promise<ActionResult<{ id: string }>> {
     return safeAction("things.create", async () => {
       const ctx = await requireRole("things:manage");
       const data = zParse(createThingSchema, input);
       const thing = await thingService.create(ctx, data);
       revalidatePath("/things");
       return { id: thing.id };
     });
   }
   ```
5. **UI** — server page fetches via the service; client components call
   actions and `toast` the `ActionResult`. URL is the state for
   lists/filters (SearchInput + Pagination are URL-driven already).
6. **Tests** — service tests with the mocked-prisma harness (copy any
   `__tests__` file as a template); pure math gets direct unit tests.

## Rules that reviewers enforce

- No Prisma outside `src/services` and `src/lib`.
- No plan/permission checks in UI — services only (UI may *read*
  entitlements to gray buttons).
- Money is `Decimal(12,2)` in DB, `round2()` in math, serialized to
  `number` at the page boundary.
- New queries on big tables need an index in the same PR (see DATABASE.md).
- Every user-visible error path returns `ApiError` with `expose: true`.
- Server-only modules start with `import "server-only"`.

## Debugging

- Structured logs: `logger.info/warn/error(msg, meta)` — JSON in prod,
  pretty in dev. Request ids come from `x-vercel-id` (Phase 4).
- `SELECT * FROM audit_logs ORDER BY "createdAt" DESC LIMIT 50` answers
  "who did what" — every mutation and AI tool call is there.
- Webhook replay: `stripe events resend evt_...` — must return
  `{duplicate:true}` the second time.
