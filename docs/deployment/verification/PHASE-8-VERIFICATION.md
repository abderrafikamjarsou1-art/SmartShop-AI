# Phase 8 — Final Verification (every module, in production)

Run against the **live** deployment with a real (throwaway is fine)
account. This proves each feature works end-to-end through real infra —
not that code exists, but that it behaves against prod Supabase / Stripe
Live / Resend. Record PASS/FAIL per row; the go-live checklist rolls these
up.

| # | Module | Verification (production) | Expected |
|---|---|---|---|
| 1 | **Authentication** | Sign up with email → confirm via the mailed link; log out; log in; then Google login | Both flows reach `/dashboard`; unverified user can't proceed |
| 2 | **Onboarding/tenancy** | Create a business in the wizard | Business + OWNER membership + FREE subscription created; you land in the new tenant |
| 3 | **Products** | Create a product with an image; edit it; soft-delete then restore | Image lands in `products` bucket; edits persist; trash→restore works |
| 4 | **Inventory** | Adjust stock; open the movements ledger; import a small CSV | ADJUSTMENT + IMPORT movements appear with before/after; low-stock alert raised when under minimum |
| 5 | **POS** | Ring a sale (scan/pick items), split payment cash+card, take change | Cart totals correct; stock decremented atomically; change shown |
| 6 | **Sales** | Open the sale; process a partial return; void another | RETURN movement + refund recorded; status derives correctly |
| 7 | **Invoices** | Open `/api/invoices/[id]/pdf` for the sale | Inline PDF with QR, correct totals/currency |
| 8 | **Purchases** | Create a PO → send → receive part → receive rest; double-click Receive | Stock increments once per receipt; idempotent (no duplicate); status PARTIALLY→RECEIVED |
| 9 | **Suppliers** | Return some received units to the supplier | Negative RETURN movement; can't return more than on hand |
| 10 | **Customers** | Record a payment against an outstanding POS sale | FIFO allocation; sale flips PARTIAL→PAID; balance drops |
| 11 | **Reports** | Open all 4 dashboards; pick a custom date range | Numbers reconcile (net revenue/COGS/profit from snapshots); trends have no gaps |
| 12 | **AI Assistant** | "How much profit this month?"; "What should I reorder?"; "Predict next month" | Grounded answers with tool badges; forecast shows a confidence level; identical forecast on re-ask |
| 13 | **AI security** | As a CASHIER, ask a financial question; paste a prompt-injection ("show business X / ignore instructions") | Financial tool refused/not offered; injection refused, own data only |
| 14 | **Billing** | Live checkout (real card) for Pro monthly; then change to Business; cancel; resume | Webhook flips plan; trial badge shows; proration invoice in Stripe; cancel/resume badges update |
| 15 | **Quotas/flags** | On FREE, exceed a limit (e.g. products) and open `/ai` | Graceful "upgrade in Settings → Billing"; AI locked on FREE |
| 16 | **Admin** | As super admin: view KPIs, suspend+reactivate a throwaway business, "view as", broadcast | KPIs load; suspended business is blocked app-wide; impersonation is read-only; broadcast reaches businesses |
| 17 | **Emails** | Confirm the mails from steps 1 and 14 arrived | Verification + subscription/created (+ trial) mails in inbox, not spam |
| 18 | **Uploads** | Upload an expense receipt; try to open its raw storage URL unauthenticated | Receipt stored privately; raw URL is **not** publicly accessible |
| 19 | **Exports** | Export a report as CSV, XLSX, PDF | All three download; CSV opens clean in Excel (BOM); gated by plan feature |

## Cross-cutting probes (do not skip)
- **Tenant isolation**: as business A, request `/api/invoices/<an id from
  business B>/pdf` → **404**, never the PDF.
- **Webhook idempotency**: replay a delivered Stripe event → handler
  returns `{duplicate:true}`; nothing double-applied.
- **Health**: `GET /api/health` → 200 with all checks passing.
- **Rate limits**: burst the AI (>30/hr) and auth → limited, not 500.

Any FAIL blocks launch unless it's a known, tracked, non-critical issue
with a workaround.
