import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Host'Lik PM — Work OS",
    short_name: "Host'Lik PM",
    description: "Manage your projects flawlessly and collaborate in real-time.",
    start_url: '/',
    display: 'standalone',
    background_color: '#101223',
    theme_color: '#0073ea',
    orientation: 'any',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/icon.svg',
        sizes: '192x192 512x512',
        type: 'image/svg+xml',
      },
    ],
    categories: ['productivity', 'business', 'utilities'],
  };
}
