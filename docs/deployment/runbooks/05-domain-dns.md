# Runbook 05 — Domain, DNS, HTTPS, headers, SEO (Phase 7)

## 1. DNS records
At your registrar / DNS host:

| Record | Host | Value | Purpose |
|---|---|---|---|
| CNAME | `app` | `cname.vercel-dns.com` | app on `app.yourdomain.com` |
| A / ALIAS | `@` | Vercel apex target (or redirect to `app`) | apex |
| TXT (SPF) | `@` | from Resend | email auth |
| CNAME ×3 (DKIM) | from Resend | from Resend | email signing |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:admin@yourdomain.com` | email policy |

- Decide the canonical host. If the app lives at `app.yourdomain.com`,
  redirect the apex (`yourdomain.com`) to it in Vercel → Domains. Whatever
  you pick must equal `NEXT_PUBLIC_APP_URL` (Stripe redirects + CSRF origin
  checks depend on it).
- Propagation: `dig app.yourdomain.com` should resolve to the Vercel
  target before you announce.

## 2. HTTPS / SSL
- Automatic via Vercel (Let's Encrypt) once the domain verifies.
- Confirm: padlock present; `curl -I http://app.yourdomain.com` → 308
  redirect to https.

## 3. Security headers
Added in `next.config` (SECURITY-AUDIT S7, code in
`fixes/next.config.patch.md`): HSTS, X-Content-Type-Options,
X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy, and a CSP.
- Roll CSP out **report-only first**, watch for violations (Stripe /
  Supabase / OpenAI origins are already allow-listed), then enforce.
- Verify: `curl -I https://app.yourdomain.com` shows the headers;
  run it through a header scanner (securityheaders.com) → aim for A.
- HSTS `preload`: only submit to the preload list once every subdomain is
  HTTPS-only (hard to reverse).

## 4. robots.txt & sitemap.xml
- Copy `config/robots.route.ts` → `src/app/robots.ts` and
  `config/sitemap.route.ts` → `src/app/sitemap.ts`. App Router serves them
  at `/robots.txt` and `/sitemap.xml`.
- robots allows marketing, disallows `/dashboard`, `/admin`, `/settings`,
  `/api/`, `/auth/` — private URLs stay out of search.
- Verify: `/robots.txt` and `/sitemap.xml` return 200 with the right
  content; submit the sitemap in Google Search Console.

## 5. Open Graph & favicons
- Follow `config/metadata-and-favicons.md`: root `metadata` with OG +
  Twitter card, and the App-Router icon files (`favicon.ico`, `icon.png`,
  `apple-icon.png`, `opengraph-image.png`/`og.png`).
- Verify: view-source shows `og:*`; the URL previews correctly in the
  Facebook/X/LinkedIn debuggers; icon files return 200.

## Verify checklist
- [ ] `app.yourdomain.com` resolves; apex redirects to canonical.
- [ ] Canonical host == `NEXT_PUBLIC_APP_URL`.
- [ ] http→https; padlock valid.
- [ ] Security headers present; scanner grade A; CSP enforced (after
      report-only shakeout).
- [ ] `/robots.txt` + `/sitemap.xml` correct; sitemap submitted.
- [ ] OG card renders; favicons 200; Lighthouse SEO ≥ 95.
