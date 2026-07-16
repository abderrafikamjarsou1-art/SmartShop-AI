# Phase 9 — Go-Live Checklist

Every item has a **Verification Method** and a result you fill in (PASS /
FAIL / N/A). This is the single gate: launch only when all **BLOCKER**
rows are PASS. Non-blockers should be PASS or have a tracked follow-up.

Legend — Sev: 🔴 blocker · 🟡 launch-quality · ⚪ nice-to-have.

## A. Environment & secrets
| # | Item | Verification method | Sev | Result |
|---|---|---|---|---|
| A1 | All prod env vars set (Production target) | Vercel → Env vars shows every key from `.env.production.example` | 🔴 | ☐ |
| A2 | No server secret is `NEXT_PUBLIC_` | Grep the built client bundle for a fragment of the service-role/Stripe secret → absent | 🔴 | ☐ |
| A3 | `NEXT_PUBLIC_APP_URL` == canonical domain | Compare env value to the live domain | 🔴 | ☐ |
| A4 | Preview scope uses staging Supabase + Stripe test keys | Inspect Preview env values | 🔴 | ☐ |
| A5 | `CRON_SECRET` set; Sentry DSN/token set | Vercel env vars | 🟡 | ☐ |

## B. Database
| # | Item | Verification method | Sev | Result |
|---|---|---|---|---|
| B1 | Migrations applied | `npx prisma migrate status` → up to date | 🔴 | ☐ |
| B2 | Pooler + direct URLs connect | `psql "$DATABASE_URL" -c 'select 1'` and same for `$DIRECT_URL` | 🔴 | ☐ |
| B3 | Step-13 indexes present | SQL: 3 rows from `pg_indexes` query (runbook 06) | 🟡 | ☐ |
| B4 | Extensions present | SQL: `pg_extension` includes uuid + pg_stat_statements | 🟡 | ☐ |
| B5 | Super admin exists | SQL: `SELECT email FROM users WHERE "isSuperAdmin"` | 🔴 | ☐ |

## C. Supabase (auth + storage)
| # | Item | Verification method | Sev | Result |
|---|---|---|---|---|
| C1 | Site URL + redirect = prod domain | Auth → URL Configuration | 🔴 | ☐ |
| C2 | Email confirmation ON | Sign up → receive verification mail | 🔴 | ☐ |
| C3 | Google OAuth works in prod | Complete a Google login | 🟡 | ☐ |
| C4 | 3 buckets; `receipts` private | SQL: `storage.buckets`, `receipts.public = false` | 🔴 | ☐ |
| C5 | Storage policies applied | Upload works; cross-tenant/raw receipt URL blocked | 🔴 | ☐ |
| C6 | PITR enabled | Supabase → Database → Backups | 🔴 | ☐ |

## D. Stripe (Live)
| # | Item | Verification method | Sev | Result |
|---|---|---|---|---|
| D1 | Account activated for live charges | Stripe dashboard status | 🔴 | ☐ |
| D2 | 4 live prices; ids in env; amounts match catalog | Compare Stripe prices to `plans.ts` + env | 🔴 | ☐ |
| D3 | Webhook endpoint live w/ 7 events | Stripe → Webhooks; each test event 2xx | 🔴 | ☐ |
| D4 | Live signing secret in env | `STRIPE_WEBHOOK_SECRET` = live endpoint secret | 🔴 | ☐ |
| D5 | Idempotency | Replay an event → `{duplicate:true}` | 🔴 | ☐ |
| D6 | Customer portal enabled | Open the portal from the app | 🟡 | ☐ |
| D7 | Live checkout end-to-end | Real card → plan activates via webhook | 🔴 | ☐ |
| D8 | Tax configured or intentionally off | Stripe → Tax settings | 🟡 | ☐ |
| D9 | Promo codes (if launching with them) | Redeem a code at checkout | ⚪ | ☐ |

## E. Email (Resend + Supabase)
| # | Item | Verification method | Sev | Result |
|---|---|---|---|---|
| E1 | Domain verified (SPF+DKIM) | Resend → Domains = Verified | 🔴 | ☐ |
| E2 | Prod key + verified `EMAIL_FROM` | Env + Resend sender | 🔴 | ☐ |
| E3 | Verification + reset mails arrive | Trigger both; links resolve | 🔴 | ☐ |
| E4 | 5 billing templates arrive in inbox | `stripe trigger` each; check inbox not spam | 🟡 | ☐ |
| E5 | Invoice PDF renders | Open `/api/invoices/[id]/pdf` | 🟡 | ☐ |

## F. Vercel & domain
| # | Item | Verification method | Sev | Result |
|---|---|---|---|---|
| F1 | Prod build green; migrations in build log | Vercel deployment log | 🔴 | ☐ |
| F2 | Domain attached; SSL valid; http→https | `curl -I` + padlock | 🔴 | ☐ |
| F3 | Supabase host in `images.remotePatterns` | Product image loads via `next/image` | 🟡 | ☐ |
| F4 | Cron route present + authed | `curl` with bearer → ok; without → 401; cron listed in Vercel | 🟡 | ☐ |
| F5 | Uptime monitor on `/api/health` | Monitor shows green; test alert fires | 🟡 | ☐ |

## G. Security & headers
| # | Item | Verification method | Sev | Result |
|---|---|---|---|---|
| G1 | Security headers present | `curl -I` shows HSTS/CSP/XFO/etc.; scanner grade A | 🔴 | ☐ |
| G2 | Tenant isolation | Request another business's invoice PDF → 404 | 🔴 | ☐ |
| G3 | RBAC enforced | CASHIER blocked from financial action + AI financial tools | 🔴 | ☐ |
| G4 | Prompt-injection resistant | Injection prompt → refused, own data only | 🔴 | ☐ |
| G5 | Rate limits fire | Burst AI + auth → limited, not 500 | 🟡 | ☐ |
| G6 | SECURITY-AUDIT S1–S10 deployed | Confirm each fix is in the deployed build | 🔴 | ☐ |

## H. SEO & accessibility
| # | Item | Verification method | Sev | Result |
|---|---|---|---|---|
| H1 | robots.txt + sitemap.xml correct | Fetch both; private routes disallowed | 🟡 | ☐ |
| H2 | OG card + favicons | Social debugger preview; icon files 200 | 🟡 | ☐ |
| H3 | Lighthouse SEO ≥ 95 (marketing) | Run Lighthouse | ⚪ | ☐ |
| H4 | Lighthouse a11y ≥ 90; keyboard POS pass | Lighthouse + manual keyboard run | 🟡 | ☐ |

## I. Backups & monitoring
| # | Item | Verification method | Sev | Result |
|---|---|---|---|---|
| I1 | Nightly dump job green | GitHub Actions run history | 🔴 | ☐ |
| I2 | Storage mirror green | Mirror job/log | 🟡 | ☐ |
| I3 | One restore drill passed this week | `verify-restore.sql` output | 🔴 | ☐ |
| I4 | Sentry receiving events; source maps | Trigger a test error; see it in Sentry | 🟡 | ☐ |

## J. Final smoke (prod, real account)
| # | Item | Verification method | Sev | Result |
|---|---|---|---|---|
| J1 | Signup→onboard→product→POS sale→invoice PDF | Do it live | 🔴 | ☐ |
| J2 | PO receive → stock up → alert resolves | Do it live | 🟡 | ☐ |
| J3 | Customer payment → sale PAID | Do it live | 🟡 | ☐ |
| J4 | AI profit answer + forecast | Ask live | 🟡 | ☐ |
| J5 | Report export CSV/XLSX/PDF | Export live | 🟡 | ☐ |
| J6 | Admin: KPIs, suspend/reactivate, broadcast | Do it live | 🟡 | ☐ |

---
**Go / No-Go:** all 🔴 rows PASS → **GO**. Any 🔴 FAIL → **NO-GO**.
🟡 should be PASS or carry a tracked follow-up. ⚪ optional.
