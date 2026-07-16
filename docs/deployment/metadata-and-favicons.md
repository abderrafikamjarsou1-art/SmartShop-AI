# Open Graph, favicons & root metadata (Phase 7)

These are the last SEO/branding pieces. All config, no business logic.

## 1. Root metadata — `src/app/layout.tsx`

Set an app-wide `metadata` export (per-page titles already override the
template from earlier steps). This gives every shared link a title, a
description, and an OG/Twitter card.

```ts
import type { Metadata } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.yourdomain.com";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: { default: "SmartShop AI — Run your shop with AI", template: "%s · SmartShop AI" },
  description: "Inventory, POS, invoicing, purchasing, reports and an AI copilot for your shop — in one place.",
  applicationName: "SmartShop AI",
  openGraph: {
    type: "website",
    url: base,
    siteName: "SmartShop AI",
    title: "SmartShop AI — Run your shop with AI",
    description: "Inventory, POS, invoicing, reports and an AI copilot for your shop.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SmartShop AI" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartShop AI",
    description: "Run your shop with AI.",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};
```

Note: authenticated layouts (dashboard/admin) should set
`robots: { index: false }` in their own segment metadata so private
screens stay out of search — this mirrors robots.ts.

## 2. Favicons & icons — App Router file conventions

Drop these files in `src/app/` and Next wires the tags automatically —
no `<link>` markup needed:

| File | Purpose | Size |
|---|---|---|
| `favicon.ico` | classic tab icon | 32×32 (multi-res ico) |
| `icon.png` | modern browsers | 512×512 |
| `apple-icon.png` | iOS home screen | 180×180 |
| `opengraph-image.png` (or `/public/og.png`) | social share card | 1200×630 |

Optional PWA polish: `src/app/manifest.ts` returning name, theme color
(match the emerald primary), and the icon set.

## 3. Verify after deploy

- View-source on `/` → `<title>`, `og:*`, `twitter:*` present.
- Paste the production URL into the Facebook Sharing Debugger / X Card
  Validator / LinkedIn Post Inspector → card renders with `og.png`.
- `/favicon.ico`, `/icon.png`, `/apple-icon.png` all 200.
- Lighthouse SEO ≥ 95 on the marketing pages.
