// =====================================================================
// SEO CONFIG — copy to: src/app/sitemap.ts
// =====================================================================
// Only PUBLIC marketing routes belong in the sitemap. Authenticated app
// routes are intentionally excluded (they're also disallowed in robots).
// Add public pages here as you add them (pricing, features, legal, blog).
// =====================================================================

import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.yourdomain.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${base}/`,        lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "weekly",  priority: 0.8 },
    { url: `${base}/login`,   lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/signup`,  lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // legal:
    { url: `${base}/terms`,   lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];
}
