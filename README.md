# SmartShop AI

A production-grade, multi-tenant SaaS for running a retail shop: inventory,
point-of-sale, invoicing, purchasing, customers & suppliers, expenses,
reporting, an AI business copilot, and Stripe billing — with role-based
access control and a super-admin console. Built on **Next.js 15** (App
Router, Server Actions), **Prisma + PostgreSQL (Supabase)**, **Stripe**,
**OpenAI**, and **Resend**.

> **Architecture in one line:** every mutation flows
> **UI → Server Action → Zod → Service → Prisma → Postgres**. Actions are
> thin (auth + validate + delegate); all business logic and every
> tenant-scoping `businessId` filter live in the service layer; money is
> `Decimal`, and financial reports read immutable sale/purchase snapshots,
> never live prices.

## Features (modules)

| Module | What it does |
|---|---|
| **Auth & multi-tenancy** | Supabase email + Google login, email verification, one user across many businesses, a role per business |
| **RBAC** | 5 roles (OWNER, ADMIN, MANAGER, CASHIER, EMPLOYEE) enforced in every action |
| **Products & catalog** | Products, categories, images (Supabase Storage), SKU/barcode unique per tenant |
| **Inventory** | Append-only movement ledger (every stock change is an event), CSV import, low-stock alerts |
| **POS & sales** | Barcode POS, mixed/split payments, change, idempotent checkout (offline-ready `clientRef`), returns & voids |
| **Invoices** | Per-sale PDF invoices with QR (pdf-lib) |
| **Purchases** | Purchase orders, partial receiving with idempotent goods-receipts, supplier returns |
| **Customers & suppliers** | Contacts, tags, store credit, account payments allocated FIFO to open sales |
| **Expenses** | Categorized expenses, tax, attachments, recurring templates materialized on schedule |
| **Reports** | Executive / sales / inventory / financial dashboards from snapshot data; CSV/XLSX/PDF export |
| **AI copilot** | Permission-gated tools, deterministic forecasting, streaming chat grounded in the tenant's own data |
| **Billing** | Stripe Checkout, Customer Portal, plan/quota entitlements, webhook-driven state (one-way sync) |
| **Super admin** | Platform KPIs, business suspend/reactivate, read-only impersonation, broadcasts |

## Tech stack

- **Framework:** Next.js 15 (App Router, RSC, Server Actions), React 19, TypeScript
- **Data:** PostgreSQL via Supabase, Prisma ORM
- **Auth & storage:** Supabase Auth + Storage
- **Payments:** Stripe (Checkout, Billing, Customer Portal, webhooks)
- **AI:** OpenAI
- **Email:** Resend (+ Supabase for auth mail)
- **UI:** Tailwind CSS v4, shadcn/ui (Radix), Recharts, lucide-react
- **Testing:** Vitest (unit), Playwright (e2e)

## Prerequisites

- **Node.js ≥ 20**
- A **Supabase** project (Postgres + Auth + Storage)
- A **Stripe** account, an **OpenAI** API key, a **Resend** account (+ verified domain for production email)

## Getting started (local)

```bash
# 1. Install dependencies (runs `prisma generate` via postinstall)
npm install

# 2. Configure environment
cp .env.example .env.local
#   then fill in DATABASE_URL, DIRECT_URL, Supabase, Stripe (test),
#   OpenAI, and Resend values. See docs/ENV-VARS.md for every variable.

# 3. Create the database schema
npx prisma migrate deploy      # applies prisma/migrations
#   (first time from scratch, you can instead run:
#    npx prisma migrate dev --name init)

# 4. Apply Supabase storage policies (SQL editor)
#   run prisma/storage-policies.sql  — creates the logos/products/receipts
#   buckets' access rules (receipts stays private, served via signed URLs)

# 5. Run
npm run dev                    # http://localhost:3000
```

Create your first business through the in-app onboarding wizard after
signing up. To grant yourself the super-admin console:

```sql
UPDATE users SET "isSuperAdmin" = true WHERE email = 'you@example.com';
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | `prisma generate` + `next build` |
| `npm start` | Production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright e2e |
| `npm run prisma:studio` | Prisma Studio |

## Environment variables

Full annotated reference: **`docs/ENV-VARS.md`** and **`.env.example`**
(local) / **`.env.production.example`** (prod). Key rule: only the three
`NEXT_PUBLIC_*` variables are safe in the browser; everything else is
server-only. Runtime uses the Supabase **transaction pooler** URL
(`DATABASE_URL`); migrations use the **direct** URL (`DIRECT_URL`).

## Docker

```bash
cp .env.example .env.local     # fill in Supabase/Stripe/OpenAI/Resend
docker compose up --build      # app on :3000, Postgres on :5432
```

`docker-compose.yml` runs the app against a local Postgres; external
services (Supabase Auth, Stripe, OpenAI, Resend) still need real keys in
`.env.local`. The `Dockerfile` produces a small standalone runtime image.

## Deployment

The full production playbook lives in **`docs/deployment/`**:

- `runbooks/01-06` — Supabase, Stripe Live, Resend, Vercel, domain/DNS, database
- `verification/PHASE-8-VERIFICATION.md` — per-module production checks
- `verification/GO-LIVE-CHECKLIST.md` — PASS/FAIL launch gate
- `DEPLOYMENT-REPORT.md` — URLs, webhooks, backup/rollback/monitoring/maintenance

`vercel.json` sets the region, the `prisma migrate deploy && next build`
build command, the daily recurring-expenses cron, and function timeouts.

## Project structure

```
.
├── prisma/
│   ├── schema.prisma            # single source of truth (25 models)
│   ├── migrations/              # SQL migrations
│   ├── storage-policies.sql     # Supabase Storage RLS
│   └── seed.ts
├── src/
│   ├── app/                     # App Router: (auth) (marketing) (dashboard) admin api
│   │   ├── (dashboard)/         # products, inventory, sales/pos, purchases,
│   │   │                        # customers, suppliers, expenses, reports, ai, settings
│   │   ├── admin/               # super-admin console
│   │   └── api/                 # ai/chat, webhooks/stripe, invoices & reports PDF/export,
│   │                            # cron/recurring-expenses, health
│   ├── actions/                 # server actions (thin: auth → zod → service)
│   ├── services/                # business logic (all tenant-scoped Prisma access)
│   ├── lib/                     # prisma, supabase, auth, tenant, validation, finance, ai, billing
│   ├── components/              # ui/ (shadcn primitives) + feature components
│   └── config/                  # navigation
├── docs/                        # architecture, security, ops, API, deployment
├── e2e/ · tests/                # Playwright + concurrency tests
├── Dockerfile · docker-compose.yml · vercel.json
└── .env.example · .env.production.example
```

## Testing

- **Unit** (`npm test`): finance math, sale/return math, CSV, product & report
  logic, service behaviors — colocated in `__tests__`.
- **E2E** (`npm run test:e2e`): the POS happy path in `e2e/pos.spec.ts`.
- **Concurrency** (`tests/concurrency.test.ts`): idempotent checkout / no
  oversell under parallel requests (needs a test DB).

## License

Proprietary — © SmartShop AI. All rights reserved.
