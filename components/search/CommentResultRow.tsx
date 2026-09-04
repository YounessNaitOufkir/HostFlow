"use client";

import React from "react";
import { MessageSquare } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import type { CommentHit } from "@/hooks/queries/useGlobalSearch";

/**
 * A comment that matched.
 *
 * Reads the other way round from a task row on purpose: the task name is the
 * heading, because a comment on its own means nothing until you know what it
 * is about, and the snippet sits underneath as the evidence for why the row is
 * here at all.
 *
 * `snippet` arrives as plain text with the markup already stripped, and is
 * rendered as a string. Nothing on this path can put the stored HTML back into
 * the page.
 */

function markMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-amber-100 dark:bg-amber-400/25 text-inherit rounded-[2px] px-[1px]">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  );
}

interface Props {
  hit: CommentHit;
  query: string;
  active?: boolean;
  onSelect: (hit: CommentHit) => void;
  onHover?: () => void;
}

export function CommentResultRow({ hit, query, active = false, onSelect, onHover }: Props) {
  const t = useT();

  return (
    <button
      type="button"
      onClick={() => onSelect(hit)}
      onMouseEnter={onHover}
      className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
        active
          ? "bg-blue-50 dark:bg-slate-700/60 shadow-[inset_3px_0_0_#f5a623]"
          : "hover:bg-gray-50 dark:hover:bg-slate-700/40"
      }`}
    >
      <MessageSquare size={14} className="text-gray-400 shrink-0 mt-[3px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-gray-900 dark:text-gray-100">
          {t("search.inComment", { item: hit.itemName })}
        </span>
        <span className="block text-[12px] text-gray-600 dark:text-slate-300 mt-[2px] line-clamp-2">
          {markMatch(hit.snippet, query)}
        </span>
        <span className="block truncate text-[11px] text-gray-400 dark:text-slate-500 mt-[2px]">
          {hit.authorName}
          {hit.authorName && hit.workspaceName ? " · " : ""}
          {hit.workspaceName}
          {hit.workspaceName ? " › " : ""}
          {hit.boardName}
        </span>
      </span>
    </button>
  );
}

export default CommentResultRow;
