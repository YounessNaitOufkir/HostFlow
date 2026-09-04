"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { useGlobalSearch } from "@/hooks/queries/useGlobalSearch";
import { MIN_SEARCH_LENGTH } from "@/hooks/queries/useDependencySearch";
import { SearchResultRow } from "@/components/search/SearchResultRow";
import { CommentResultRow } from "@/components/search/CommentResultRow";
import { displayStatus } from "@/lib/i18n/labels";
import type { Board, Profile, Workspace } from "@/types";

/**
 * Somewhere to go digging.
 *
 * The palette answers the common question - you know roughly what it is called
 * and want to be looking at it. This answers the rarer one, where a name alone
 * returns forty rows and you need to cut them down: by workspace, by status,
 * by who has it. Results stay put while you narrow, which a palette that
 * closes on Enter cannot do, and the view has a place in the sidebar so it can
 * be returned to.
 */

interface Props {
  boards: Board[];
  workspaces: Workspace[];
  profiles: Profile[];
  /** Seeded when the palette hands over, so the query is not retyped. */
  initialQuery?: string;
  onSelectItem: (boardId: string, itemId: string) => void;
}

const DEBOUNCE_MS = 200;

export function SearchView({
  boards,
  workspaces,
  profiles,
  initialQuery = "",
  onSelectItem,
}: Props) {
  const t = useT();
  const [raw, setRaw] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [workspaceId, setWorkspaceId] = useState("");
  const [status, setStatus] = useState("");
  const [ownerId, setOwnerId] = useState("");
  // Off by default; the view is where asking for it makes sense, because
  // this is the surface people reach for when something has gone missing.
  const [includeDeleted, setIncludeDeleted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQuery(raw), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [raw]);

  const { data, isFetching } = useGlobalSearch(query, boards, workspaces, true, includeDeleted);
  const all = useMemo(() => data?.items ?? [], [data]);
  const comments = useMemo(() => data?.comments ?? [], [data]);

  // Narrowing happens here rather than in the query: the result set is capped
  // well below a thousand, and filtering in memory keeps every adjustment
  // instant instead of costing a round trip.
  const results = useMemo(
    () =>
      all.filter(
        (hit) =>
          (!workspaceId || hit.workspaceId === workspaceId) &&
          (!status || hit.status === status) &&
          (!ownerId || hit.assigneeIds.includes(ownerId))
      ),
    [all, workspaceId, status, ownerId]
  );

  /** Only the statuses actually present, so the filter never offers a dead end. */
  const statuses = useMemo(
    () => Array.from(new Set(all.map((h) => h.status).filter((s): s is string => !!s))).sort(),
    [all]
  );

  const searched = query.trim().length >= MIN_SEARCH_LENGTH;
  const select = "px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400/40";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f5f6f8] dark:bg-slate-950">
      <div className="px-8 pt-8 pb-4 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
          {t("search.viewTitle")}
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{t("search.viewSub")}</p>

        <div className="flex flex-wrap items-center gap-2.5 mt-5">
          <div className="flex-1 min-w-[260px] flex items-center gap-2.5 px-3.5 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus-within:ring-2 focus-within:ring-amber-400/40">
            <Search size={16} className="text-gray-400 shrink-0" />
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={t("search.placeholderDeep")}
              autoFocus
              className="flex-1 bg-transparent border-0 outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"
            />
            {isFetching && <Loader2 size={14} className="animate-spin text-gray-400" />}
          </div>

          <select className={select} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
            <option value="">{t("search.filterWorkspace")}</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          <select className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("search.filterStatus")}</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{displayStatus(t, s)}</option>
            ))}
          </select>

          <select className={select} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">{t("search.filterOwner")}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-gray-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="accent-amber-500"
            />
            {t("search.includeTrash")}
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-10">
        {!searched ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <Search size={40} className="text-gray-300 dark:text-slate-700 mb-4" />
            <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200">
              {t("search.emptyTitle")}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1.5 max-w-sm">
              {t("search.emptyBody")}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <p className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400 border-b border-gray-100 dark:border-slate-800">
              {results.length === 1
                ? t("search.resultCountOne")
                : t("search.resultCount", { count: results.length })}
            </p>
            {results.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-400">
                {t("search.noResults", { query: query.trim() })}
              </p>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-slate-800/60">
                {results.map((hit) => (
                  <SearchResultRow
                    key={hit.id}
                    hit={hit}
                    query={query}
                    profiles={profiles}
                    boards={boards}
                    onSelect={(h) => onSelectItem(h.boardId, h.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {searched && comments.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden mt-4">
            <p className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400 border-b border-gray-100 dark:border-slate-800">
              {t("search.comments", { count: comments.length })}
            </p>
            <div className="divide-y divide-gray-50 dark:divide-slate-800/60">
              {comments.map((hit) => (
                <CommentResultRow
                  key={hit.id}
                  hit={hit}
                  query={query}
                  onSelect={(h) => onSelectItem(h.boardId, h.itemId)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchView;
