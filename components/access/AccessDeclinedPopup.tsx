"use client";

import React, { useId, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldX } from "lucide-react";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { useAccessRequests } from "@/hooks/useAccessRequests";
import { isStandingDecline } from "@/lib/accessRequests";
import type { Profile } from "@/types";

const seenKey = (requestId: string) => `hf:access-declined-seen:${requestId}`;

function hasSeen(requestId: string): boolean {
  try {
    return localStorage.getItem(seenKey(requestId)) === "1";
  } catch {
    return false;
  }
}

/**
 * The answer to a declined request, told once: the first time the person
 * opens HostFlow after the decision, or the moment it lands if they have it
 * open. It stays in their notifications and in the sidebar after that.
 */
export function AccessDeclinedPopup({ profile }: { profile: Profile | null }) {
  const t = useT();
  const { bcp47 } = useLanguage();
  const { latestByUser } = useAccessRequests(profile?.id);
  const [closedId, setClosedId] = useState<string | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const latest = profile ? latestByUser.get(profile.id) : undefined;
  if (!profile || profile.is_staff || !isStandingDecline(latest)) return null;
  if (closedId === latest.id || hasSeen(latest.id)) return null;

  const close = () => {
    try {
      localStorage.setItem(seenKey(latest.id), "1");
    } catch {
      // Storage blocked: it closes for this visit and shows again next time.
    }
    setClosedId(latest.id);
  };
  const date = new Intl.DateTimeFormat(bcp47, { day: "numeric", month: "short" }).format(
    new Date(latest.decided_at ?? latest.created_at)
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div className="absolute inset-0 bg-slate-900/30 dark:bg-slate-950/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-xl p-6 text-center">
        <div className="mx-auto w-11 h-11 rounded-full grid place-items-center bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300">
          <ShieldX size={22} aria-hidden />
        </div>
        <h2 id={titleId} className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          {t("access.popupTitle")}
        </h2>
        <p className="mt-3 rounded-lg bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 break-words">
          “{latest.reason ?? t("access.defaultReason")}”
        </p>
        <p id={bodyId} className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {t("access.popupBody", { date })}
        </p>
        <button
          type="button"
          onClick={close}
          autoFocus
          className="mt-5 w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          {t("access.ok")}
        </button>
      </div>
    </div>,
    document.body
  );
}
