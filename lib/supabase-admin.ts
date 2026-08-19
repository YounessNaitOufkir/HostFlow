import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Admin client that bypasses RLS. Use ONLY in secure server environments.
 *
 * Resolved lazily and never falls back to the anon key. The previous fallback made
 * a missing secret indistinguishable from an empty database — RLS simply returned
 * nothing — instead of failing. Building the client on first use also keeps a
 * missing key from breaking the build, since it only matters at request time.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. Admin operations cannot run; ' +
        'set it in the deployment environment.'
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
