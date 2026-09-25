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
      // Concrete PNG sizes first: Windows and Chromium desktops pick the best
      // *matching size* for the taskbar/shortcuts rather than scaling an 'any'
      // SVG, and this one draws its own rounding and light-from-top gradient
      // instead of the flat maskable square below (see
      // scripts/assets/icon-desktop.svg / scripts/generate-desktop-icons.mjs).
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // The phone icon, unchanged: the mark sits inside the maskable safe
      // zone, so it survives an OS crop and still looks right uncropped.
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
    // Right-click / long-press on the installed app's icon. Each target is a
    // board-independent view — see lib/shortcutLink.ts, which app/page.tsx
    // reads once on launch.
    shortcuts: [
      {
        name: 'My Work',
        url: '/?view=my_work',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Portfolio overview',
        url: '/?view=portfolio_overview',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Master Gantt Chart',
        url: '/?view=workspace_gantt',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Notifications',
        url: '/?view=notifications',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
    // Reuses the existing app window instead of opening a second one when a
    // shortcut, or a link the OS has been set to open in this app, launches
    // while it's already running. Chromium honors this; other browsers ignore
    // the field.
    launch_handler: {
      client_mode: 'focus-existing',
    },
    categories: ['productivity', 'business', 'utilities'],
  };
}
