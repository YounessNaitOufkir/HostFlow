import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * The company name, for anything rendered on the server.
 *
 * Server-only: it uses the service-role client, so it must never be imported from
 * a client component. (There is no `server-only` package installed here to enforce
 * that at build time, hence this note.)
 *
 * Service role because both callers run without a session — the manifest is fetched
 * by the browser's install machinery, and metadata is resolved during render — while
 * organization_settings grants SELECT to `authenticated` only, so an anon read comes
 * back empty.
 *
 * Wrapped in React `cache` so the manifest route and the layout's generateMetadata
 * share one query per request rather than issuing two. The metadata docs recommend
 * exactly this where `fetch` (and its automatic memoisation) is not in play.
 */
export const FALLBACK_COMPANY_NAME = "HostFlow";

export const getCompanyName = cache(async (): Promise<string> => {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("organization_settings")
      .select("company_name")
      .limit(1)
      .maybeSingle();
    if (error) return FALLBACK_COMPANY_NAME;
    return data?.company_name?.trim() || FALLBACK_COMPANY_NAME;
  } catch {
    // Never let a settings read break installability or page rendering.
    return FALLBACK_COMPANY_NAME;
  }
});
