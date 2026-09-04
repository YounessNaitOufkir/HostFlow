"use client";

import React from "react";
import { useT } from "@/components/LanguageProvider";
import { displayStatus } from "@/lib/i18n/labels";
import { statusHexOr, NEUTRAL_STATUS_COLOR } from "@/lib/statusColor";
import type { SearchHit } from "@/hooks/queries/useGlobalSearch";
import type { Profile, Board } from "@/types";

/**
 * One search result.
 *
 * The path is the point. Every property runs the same lifecycle here, so board
 * names repeat and task names repeat with them - there can be four boards
 * called Launch with a "Client handover" on each. A row showing only the task
 * name identifies nothing, so it leads with workspace › board › group, and the
 * workspace carries the strongest weight of the three because it is usually
 * the only part that differs.
 *
 * Status and assignee ride along for the same reason: half of "which one did I
 * mean" is answered by state, the other half by who has it, and answering both
 * here saves opening the wrong one to find out.
 */

/** Splits a name around the match so it can be marked without dangerouslySetInnerHTML. */
function markMatch(name: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return name;
  const at = name.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return name;
  return (
    <>
      {name.slice(0, at)}
      <mark className="bg-amber-100 dark:bg-amber-400/25 text-inherit rounded-[2px] px-[1px]">
        {name.slice(at, at + q.length)}
      </mark>
      {name.slice(at + q.length)}
    </>
  );
}

interface Props {
  hit: SearchHit;
  query: string;
  profiles: Profile[];
  boards: Board[];
  active?: boolean;
  onSelect: (hit: SearchHit) => void;
  /** Hover only tracks the pointer; the keyboard owns `active`. */
  onHover?: () => void;
  compact?: boolean;
}

export function SearchResultRow({
  hit,
  query,
  profiles,
  boards,
  active = false,
  onSelect,
  onHover,
  compact = false,
}: Props) {
  const t = useT();

  const board = boards.find((b) => b.id === hit.boardId);
  const statusCol = board?.columns?.find((c) => c.type === "status");
  const options = statusCol?.settings?.statusLabels;
  const colour = hit.status
    ? statusHexOr(options?.find((o) => o.label === hit.status)?.color)
    : NEUTRAL_STATUS_COLOR;

  const people = hit.assigneeIds
    .map((id) => profiles.find((p) => p.id === id))
    .filter((p): p is Profile => !!p)
    .slice(0, 3);

  return (
    <button
      type="button"
      onClick={() => onSelect(hit)}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 text-left transition-colors ${
        compact ? "px-3 py-2" : "px-4 py-2.5"
      } ${
        active
          ? "bg-blue-50 dark:bg-slate-700/60 shadow-[inset_3px_0_0_#f5a623]"
          : "hover:bg-gray-50 dark:hover:bg-slate-700/40"
      }`}
    >
      <span
        aria-hidden="true"
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: colour }}
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-gray-900 dark:text-gray-100">
          {markMatch(hit.name, query)}
        </span>
        <span className="block truncate text-[11.5px] text-gray-500 dark:text-slate-400 mt-[1px]">
          {hit.workspaceName && (
            <>
              <b className="font-semibold text-gray-600 dark:text-slate-300">{hit.workspaceName}</b>
              <span className="mx-1 text-gray-300 dark:text-slate-600">›</span>
            </>
          )}
          <b className="font-semibold text-gray-600 dark:text-slate-300">{hit.boardName}</b>
          {hit.groupTitle && (
            <>
              <span className="mx-1 text-gray-300 dark:text-slate-600">›</span>
              {hit.groupTitle}
            </>
          )}
        </span>
      </span>

      <span className="flex items-center gap-2 shrink-0">
        {hit.deleted && (
          <span className="text-[10px] font-semibold text-white bg-gray-400 dark:bg-slate-600 rounded px-1.5 py-[2px]">
            {t("search.deleted")}
          </span>
        )}
        {hit.status && (
          <span
            className="text-[10px] font-semibold text-white rounded px-1.5 py-[2px] max-w-[110px] truncate"
            style={{ backgroundColor: colour }}
          >
            {displayStatus(t, hit.status)}
          </span>
        )}
        {people.map((p) => (
          <span
            key={p.id}
            title={p.full_name}
            className="w-[22px] h-[22px] rounded-full text-[9px] font-bold text-white flex items-center justify-center"
            style={{ backgroundColor: p.color }}
          >
            {p.avatar_initials}
          </span>
        ))}
      </span>
    </button>
  );
}

export default SearchResultRow;
