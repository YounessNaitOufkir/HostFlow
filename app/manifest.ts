import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/lib/companyName';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
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
