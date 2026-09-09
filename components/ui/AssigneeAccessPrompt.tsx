"use client";

import React from "react";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import type { Profile } from "@/types";

interface AssigneeAccessPromptProps {
  person: Profile;
  /** Whether the signed-in user is even allowed to grant board access
   * (mirrors can_manage_board() — see lib/boardAccess.ts). When false, only
   * "Assign anyway" is offered. */
  canGrant: boolean;
  busy?: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuStyle: CSSProperties;
  onGrantAndAssign: () => void;
  onAssignAnyway: () => void;
}

/**
 * The card that appears when someone is assigned who can't actually reach
 * the board — anchored below the People cell via the same useAnchoredMenu
 * mechanism the picker itself uses, so it never blocks the rest of the
 * board the way a modal would. Shared workspaces only — see PeopleCell.tsx.
 */
export default function AssigneeAccessPrompt({
  person,
  canGrant,
  busy = false,
  menuRef,
  menuStyle,
  onGrantAndAssign,
  onAssignAnyway,
}: AssigneeAccessPromptProps) {
  const t = useT();

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="w-64 rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 shadow-lg p-3.5 z-[70]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0" style={{ backgroundColor: person.color }}>
          <Avatar
            name={person.full_name}
            initials={person.avatar_initials}
            url={person.avatar_url}
            color={person.color}
            size={24}
            title={null}
          />
        </div>
        <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">
          {person.full_name}
        </span>
      </div>

      <p className="text-[11.5px] leading-relaxed text-gray-500 dark:text-gray-400 mb-3 flex items-start gap-1.5">
        <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
        <span>
          {t("assignGuard.noAccess")}
          {!canGrant && <> {t("assignGuard.cannotGrant")}</>}
        </span>
      </p>

      <div className="flex gap-1.5">
        {canGrant && (
          <button
            type="button"
            disabled={busy}
            onClick={onGrantAndAssign}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-semibold text-white bg-[#1A2C5B] hover:bg-[#24396f] dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-900 rounded-md transition-colors disabled:opacity-50"
          >
            {busy && <Loader2 size={11} className="animate-spin" />}
            {t("assignGuard.grantAndAssign")}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onAssignAnyway}
          className="flex-1 px-2.5 py-1.5 text-[11.5px] font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
        >
          {t("assignGuard.assignAnyway")}
        </button>
      </div>
    </div>
  );
}
