# ENVIRONMENT VARIABLES

Every variable the app reads, where it's used, and how it's handled.
`.env.example` is the source of truth for the list; this explains each.

## Secret handling rules

- **Server secrets never get the `NEXT_PUBLIC_` prefix.** Only two vars
  are public (below); everything else is server-only and would leak into
  the browser bundle if prefixed. The security audit checks this.
- Secrets live in Vercel's encrypted env store (and `.env.local` for dev),
  never in git. `.env*` is gitignored except `.env.example`.
- Rotating a secret = update it in Vercel → redeploy. The Stripe webhook
  secret and Supabase service-role key are the two worth rotating on any
  suspicion.

## Reference

### Public (safe in the browser)
| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Canonical app origin; used to build Stripe redirect URLs and same-origin CSRF checks. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for the browser auth client. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key — RLS-limited, safe to ship; **not** the service role key. |

### Supabase (server)
| Var | Purpose |
|---|---|
| `DATABASE_URL` | Pooled connection (PgBouncer, port 6543) for the app. |
| `DIRECT_URL` | Direct connection (port 5432) for `prisma migrate` only. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS for server-side storage ops; **most sensitive var** — server only. |

### Stripe
| Var | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server API calls. `sk_test_` in preview, `sk_live_` in prod. |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhook signatures. Per-endpoint — prod and local `stripe listen` differ. |
| `STRIPE_PRICE_PRO_MONTHLY` | Price id → plan mapping. |
| `STRIPE_PRICE_PRO_YEARLY` | ″ |
| `STRIPE_PRICE_BUSINESS_MONTHLY` | ″ |
| `STRIPE_PRICE_BUSINESS_YEARLY` | ″ |

Price ids differ between test and live mode — swapping keys means swapping
all four ids too. `planFromPriceId()` reverse-maps them in the webhook.

### OpenAI
| Var | Purpose |
|---|---|
| `OPENAI_API_KEY` | AI copilot (Responses API). Scope the key to this project; set a monthly usage cap in the OpenAI dashboard as a backstop to the in-app rate limit. |

### Resend
| Var | Purpose |
|---|---|
| `RESEND_API_KEY` | Transactional email. **Absent → emails log instead of send** (dev degrades gracefully; billing never breaks on email). |
| `EMAIL_FROM` | Verified sender, e.g. `SmartShop AI <billing@yourdomain.com>`. |

### Observability (optional but recommended in prod)
| Var | Purpose |
|---|---|
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error tracking (server + client). Absent → Sentry no-ops. |
| `SENTRY_AUTH_TOKEN` | Source-map upload at build time. |

## Preview vs production

Preview deployments use the **staging Supabase project + Stripe test
keys**, so PR review is fully interactive with zero blast radius.
Production uses live keys. Vercel scopes env vars per environment — set
each var's target (Production / Preview / Development) deliberately.

Startup fails fast if a critical var is missing (the health check surfaces
which one), so a misconfigured deploy is caught immediately rather than at
first use.
