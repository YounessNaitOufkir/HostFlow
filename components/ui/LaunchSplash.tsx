import React from "react";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME } from "@/lib/companyName";

/**
 * The very first thing an installed-app launch shows, before auth or any
 * board data has resolved — replaces the plain white flash with the brand,
 * the way opening Slack or VS Code does. Shown once per session: app/page.tsx
 * swaps to the ordinary loading skeleton the moment anything has rendered,
 * and never comes back to this for later in-app loading.
 *
 * The ground is a deeper navy than the icon's own, so the icon reads as the
 * rounded tile it is on the desktop rather than dissolving into the page.
 */
export function LaunchSplash() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-[#0E1733]">
      <Logo variant="app" size={88} title={APP_NAME} className="drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]" />
      <div className="w-24 h-[3px] rounded-full bg-white/15 overflow-hidden" aria-hidden>
        <div className="h-full w-2/5 rounded-full bg-[#F5A623] animate-launch-bar" />
      </div>
    </div>
  );
}

export default LaunchSplash;
