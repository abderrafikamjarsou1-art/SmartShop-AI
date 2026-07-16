# Runbook 01 — Supabase (Phase 3)

Auth, OAuth, email, storage, RLS, backups, realtime, cron. Database
schema/index steps live in runbook 06.

## 1. Project
- New project, region near users (**eu-west-3 / Paris** for Morocco — low
  latency to the Vercel `cdg1` region).
- Plan: **Pro** (required for PITR and higher connection limits).

## 2. Authentication
Auth → URL Configuration:
- **Site URL**: `https://app.yourdomain.com`
- **Redirect URLs**: `https://app.yourdomain.com/auth/callback`
  (add `https://*.vercel.app/auth/callback` only if you want preview logins)

Auth → Providers:
- **Email**: enabled. Turn **Confirm email** ON — the app's
  `/auth/confirm` token_hash flow expects verification.
- **Google OAuth**: create a **production** OAuth client in Google Cloud
  Console. Authorized redirect URI must be the Supabase callback shown in
  the provider panel (`https://YOUR-REF.supabase.co/auth/v1/callback`),
  and the app's Site URL above. Paste Client ID + Secret into Supabase.

Auth → Email templates: point the confirmation + recovery links at the
production Site URL (Supabase does this from Site URL, but confirm the
templates render your brand and the links resolve to `/auth/callback` /
`/auth/confirm`).

## 3. Storage buckets
Create three (runbook 06 verifies them):
| Bucket | Public | Notes |
|---|---|---|
| `logos` | ✅ public | business logos on invoices/marketing |
| `products` | ✅ public | product images |
| `receipts` | ❌ **private** | expense receipts — served via signed URLs only |

Then apply `fixes/storage-policies.sql`: membership-scoped read, tenant-
prefixed upload paths `{businessId}/{uuid}`, size + MIME constraints.

## 4. RLS posture
App tables are protected by the tenant-scoped Prisma service layer (every
query filters `businessId`; single-row reads use `findFirst({id,
businessId})`). Storage is protected by the policies above. Do **not**
loosen storage policies to "public" for `receipts`.

## 5. Backups
- Enable **PITR** (Database → Backups).
- The offsite encrypted dump + storage mirror are covered in BACKUPS-DR.md
  — confirm they run before launch.

## 6. Realtime
Not used by the app (no Supabase Realtime subscriptions in the codebase).
Leave it **disabled** to reduce surface area and cost. If you later add
live dashboards, enable Realtime only on the specific tables involved.

## 7. Cron
Scheduled work runs on **Vercel Cron** (see vercel.json + runbook 04), not
Supabase `pg_cron` — one scheduler, colocated with the app code it calls.
Leave Supabase cron unused unless you want a DB-side maintenance job (e.g.
a nightly `webhook_events` retention delete); if so, that's pure SQL and
adds no app logic.

## Verify checklist
- [ ] Site URL + redirect URL set to production domain.
- [ ] Email confirmation ON; test signup receives a verification mail.
- [ ] Google login round-trips end to end in production.
- [ ] 3 buckets exist; `receipts` private; policies applied.
- [ ] PITR on.
- [ ] Realtime disabled (intended).
