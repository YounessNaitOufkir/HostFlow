import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/emailTemplate";

/**
 * Tells crawlers not to bother with the routes proxy.ts already 307s a
 * signed-out visitor away from. Search Console's "page with redirect" report
 * is exactly this: Google requesting a URL that only ever answers with a
 * redirect for it, because nothing told it not to try. There was no
 * robots.txt at all before this — Google was crawling blind.
 *
 * / , /privacy and /terms are the only routes proxy.ts leaves open to a
 * signed-out request (see its own comment on why), so they're the only ones
 * worth indexing in the first place.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms"],
      disallow: ["/login", "/update-password", "/auth/", "/api/"],
    },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
