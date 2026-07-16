# Runbook 03 — Resend (Phase 5)

Production transactional email. Two email paths exist and both must work:

- **Auth emails** (verification, password reset) — sent by **Supabase**,
  not Resend. Configure them in runbook 01 (Auth → email confirmation ON,
  templates point at the production Site URL). For higher deliverability
  you can plug Resend in as Supabase's custom SMTP provider (optional).
- **Product emails** (welcome, subscription created, trial ending, payment
  failed, invoice paid) — sent by the app via **Resend**, from
  `lib/billing/emails.ts`.

## 1. Verify your domain
Resend → Domains → Add `yourdomain.com`. Add the DNS records it shows:
| Type | Purpose |
|---|---|
| TXT (SPF) | authorize Resend to send as your domain |
| CNAME ×3 (DKIM) | sign messages |
| (optional) TXT DMARC | `v=DMARC1; p=quarantine; rua=mailto:admin@yourdomain.com` |

Wait for Resend to show **Verified** (green) before sending real mail.

## 2. API key + sender
- Create a **production** API key → `RESEND_API_KEY` in prod env.
- `EMAIL_FROM="SmartShop AI <billing@yourdomain.com>"` — the local part
  can be anything, the domain must be the verified one.
- Reminder: with `RESEND_API_KEY` **absent**, the app logs emails instead
  of sending (safe dev default). In production it must be present or
  billing emails silently no-op.

## 3. Verify each template
Emails must never break billing, so failures are swallowed and logged —
which means you must positively confirm each one lands:

| Email | How to trigger in production | Expect |
|---|---|---|
| Verification | Sign up a new account | Supabase mail with a working confirm link |
| Password reset | "Forgot password" | Supabase mail, link resolves to `/auth/callback` |
| Welcome | First business onboarding | Resend "Welcome" mail |
| Subscription created | Complete a live checkout | "You're on the Pro plan" (+ trial note) |
| Trial ending | `stripe trigger customer.subscription.trial_will_end` | "Trial ends in 3 days" |
| Payment failed | `stripe trigger invoice.payment_failed` | "Payment failed — action needed" |
| Invoice paid | Live renewal / `stripe trigger invoice.paid` | "Payment received — <amount>" |
| POS invoice | Not emailed today — delivered as PDF from `/api/invoices/[id]/pdf` | inline PDF, `inline` disposition |

## 4. Deliverability checks
- Send one of each to a Gmail + an Outlook address → lands in **inbox**,
  not spam. If spam: DKIM/SPF not fully propagated, or `EMAIL_FROM` domain
  ≠ verified domain.
- Check the Resend dashboard → each send shows "Delivered".

## Verify checklist
- [ ] Domain Verified in Resend (SPF + DKIM green).
- [ ] Prod `RESEND_API_KEY` set; `EMAIL_FROM` on the verified domain.
- [ ] Supabase verification + reset mails arrive with working links.
- [ ] All 5 Resend billing templates arrive in inbox (not spam).
- [ ] Invoice PDF renders from its route.
