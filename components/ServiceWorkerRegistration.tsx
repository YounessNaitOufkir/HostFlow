"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js, whose only job is the offline fallback screen.
 *
 * Production only: Turbopack's dev server already serves fresh code on every
 * request, and a service worker sitting between the browser and dev's fast
 * refresh / HMR would be a source of "why isn't my change showing up"
 * confusion with nothing to show for it locally.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No offline fallback screen is not worth surfacing to the user.
    });
  }, []);

  return null;
}

export default ServiceWorkerRegistration;
