import type { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/server';

// manifest.js is a cached Route Handler by default, which would bake the company
// name in at build time and leave the installed app named after whatever it was
// when we last deployed. Renaming the company in Settings has to reach the
// manifest without a redeploy, so this route opts out of caching.
export const dynamic = 'force-dynamic';

const FALLBACK_NAME = "Host'Lik PM";

/**
 * The installed app takes its name from organization_settings.company_name, so
 * renaming the company in Settings renames the home-screen icon too. Service role
 * because the manifest is fetched without a session: the table's SELECT policy is
 * granted to `authenticated`, and an anon read would come back empty.
 *
 * Any failure falls back to the previous hardcoded name rather than breaking
 * installability.
 */
async function companyName(): Promise<string> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('organization_settings')
      .select('company_name')
      .limit(1)
      .maybeSingle();
    if (error) return FALLBACK_NAME;
    const name = data?.company_name?.trim();
    return name || FALLBACK_NAME;
  } catch {
    return FALLBACK_NAME;
  }
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = await companyName();
  return {
    name: `${name} — Work OS`,
    short_name: name,
    description: "Manage your projects flawlessly and collaborate in real-time.",
    start_url: '/',
    display: 'standalone',
    background_color: '#1A2C5B',
    theme_color: '#1A2C5B',
    orientation: 'any',
    icons: [
      // Same file for both purposes: the mark sits inside the maskable safe zone, so
      // it survives an OS crop and still looks right uncropped. Two entries rather
      // than one 'any maskable' because Next's types take a single purpose each.
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    categories: ['productivity', 'business', 'utilities'],
  };
}
