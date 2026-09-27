"use client";

import { Loader2 } from "lucide-react";
import { useT } from "@/components/LanguageProvider";

/**
 * Shown while the live connection is down, so nobody trusts a screen that may
 * be missing a colleague's changes. It goes away by itself once the connection
 * is back and the screen has caught up.
 */
export function ReconnectingIndicator({ show }: { show: boolean }) {
  const t = useT();
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[140] flex justify-center px-4">
      {show && (
        <div
          title={t("live.reconnectingHint")}
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500 dark:text-gray-400" aria-hidden />
          {t("live.reconnecting")}
        </div>
      )}
    </div>
  );
}
