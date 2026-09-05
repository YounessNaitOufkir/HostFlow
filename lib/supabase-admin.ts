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

  // The guard shape stays as it was so TypeScript still narrows both to string
  // below; only the message changed. It used to blame the service role key for a
  // missing URL, which sends whoever is debugging a deployment to the wrong
  // setting entirely.
  if (!url || !serviceRoleKey) {
    const missing = [
      !url && 'NEXT_PUBLIC_SUPABASE_URL',
      !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean);
    throw new Error(
      `${missing.join(' and ')} is not configured. Admin operations cannot run; ` +
        'set it in the deployment environment.'
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
