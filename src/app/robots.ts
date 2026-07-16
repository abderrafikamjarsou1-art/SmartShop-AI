// =====================================================================
// SEO CONFIG — copy to: src/app/robots.ts
// =====================================================================
// App-router metadata route. Marketing pages are indexable; every
// authenticated surface (dashboard, admin, settings, API) is disallowed
// so private app URLs never enter a search index.
// =====================================================================

import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.yourdomain.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/settings", "/api/", "/auth/"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
