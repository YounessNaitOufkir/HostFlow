import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/emailTemplate";

/**
 * The three routes that are actually reachable and worth indexing when
 * signed out — see robots.ts and proxy.ts for why it's exactly these three.
 * The app itself is a single client-rendered shell behind auth at /, so
 * there are no per-board or per-workspace URLs to list; it has nothing else.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
