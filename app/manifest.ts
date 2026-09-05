import type { MetadataRoute } from 'next';
import { getCompanyName } from '@/lib/companyName';

// manifest.js is a cached Route Handler by default, which would bake the company
// name in at build time and leave the installed app named after whatever it was
// when we last deployed. Renaming the company in Settings has to reach the
// manifest without a redeploy, so this route opts out of caching.
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = await getCompanyName();
  return {
    // Both are just the company name. Windows and Android take the installed
    // shortcut's label from `name`, so any suffix here ends up on the desktop.
    name: name,
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
