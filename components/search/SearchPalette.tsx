"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, CornerDownLeft, LayoutGrid } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { useGlobalSearch, type SearchHit } from "@/hooks/queries/useGlobalSearch";
import { MIN_SEARCH_LENGTH } from "@/hooks/queries/useDependencySearch";
import { SearchResultRow } from "./SearchResultRow";
import type { Board, Profile, Workspace } from "@/types";

/**
 * Find anything, from anywhere, with the keyboard.
 *
 * Opens on Cmd/Ctrl+K over whatever you were doing and closes on Escape
 * without disturbing it, which is what makes it usable for the common case:
 * you know roughly what the task is called and you want to be looking at it.
 * The heavier hunt - not knowing what you want, needing to narrow - belongs in
 * the search view, and the row at the foot hands you over to it.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  boards: Board[];
  workspaces: Workspace[];
  profiles: Profile[];
  onSelectItem: (boardId: string, itemId: string) => void;
  onSelectBoard: (boardId: string) => void;
  onSeeAll: (query: string) => void;
}

/** Long enough that a fast typist makes one request, short enough to feel live. */
const DEBOUNCE_MS = 180;

export function SearchPalette({
  open,
  onClose,
  boards,
  workspaces,
  profiles,
  onSelectItem,
  onSelectBoard,
  onSeeAll,
}: Props) {
  const t = useT();
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Every keystroke would otherwise be a round trip.
  useEffect(() => {
    const id = setTimeout(() => setQuery(raw), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [raw]);

  // Reopening should be a blank slate, not the last thing you looked for.
  useEffect(() => {
    if (!open) return;
    setRaw("");
    setQuery("");
    setCursor(0);
    const id = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(id);
  }, [open]);

  const { data, isFetching } = useGlobalSearch(query, boards, workspaces, open);
  const items = useMemo(() => data?.items ?? [], [data]);
  const boardHits = useMemo(() => data?.boards ?? [], [data]);

  // One flat list of what Enter can land on, so the arrow keys do not have to
  // know that the results are drawn in sections.
  const rows = useMemo(
    () => [
      ...items.map((hit) => ({ kind: "item" as const, hit })),
      ...boardHits.map((b) => ({ kind: "board" as const, board: b })),
    ],
    [items, boardHits]
  );

  useEffect(() => {
    setCursor(0);
  }, [query]);

  // Arrowing past the fold should bring the row with it.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const choose = (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (row.kind === "item") onSelectItem(row.hit.boardId, row.hit.id);
    else onSelectBoard(row.board.id);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows.length) choose(cursor);
      else if (query.trim().length >= MIN_SEARCH_LENGTH) {
        onSeeAll(query.trim());
        onClose();
      }
    }
  };

  const tooShort = raw.trim().length > 0 && raw.trim().length < MIN_SEARCH_LENGTH;
  const searched = query.trim().length >= MIN_SEARCH_LENGTH;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[10vh] px-4">
      <div
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("search.title")}
        onKeyDown={onKeyDown}
        className="relative w-full max-w-[620px] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-slate-800">
          <Search size={17} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex-1 bg-transparent border-0 outline-none text-[15px] text-gray-900 dark:text-white placeholder-gray-400"
          />
          {isFetching && <Loader2 size={15} className="animate-spin text-gray-400 shrink-0" />}
          <span className="shrink-0 text-[10px] font-semibold tracking-[0.09em] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 rounded-full px-2 py-[3px]">
            {t("search.allWorkspaces")}
          </span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto">
          {tooShort && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">{t("search.keepTyping")}</p>
          )}
          {!raw.trim() && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">{t("search.prompt")}</p>
          )}
          {searched && !isFetching && rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              {t("search.noResults", { query: query.trim() })}
            </p>
          )}

          {items.length > 0 && (
            <>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-gray-400">
                {t("search.tasks", { count: items.length })}
              </p>
              {items.map((hit, i) => (
                <div key={hit.id} data-row={i}>
                  <SearchResultRow
                    hit={hit}
                    query={query}
                    profiles={profiles}
                    boards={boards}
                    active={cursor === i}
                    onHover={() => setCursor(i)}
                    onSelect={(h: SearchHit) => {
                      onSelectItem(h.boardId, h.id);
                      onClose();
                    }}
                  />
                </div>
              ))}
            </>
          )}

          {boardHits.length > 0 && (
            <>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-gray-400">
                {t("search.boards", { count: boardHits.length })}
              </p>
              {boardHits.map((b, i) => {
                const index = items.length + i;
                return (
                  <button
                    key={b.id}
                    type="button"
                    data-row={index}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => {
                      onSelectBoard(b.id);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      cursor === index
                        ? "bg-blue-50 dark:bg-slate-700/60 shadow-[inset_3px_0_0_#f5a623]"
                        : "hover:bg-gray-50 dark:hover:bg-slate-700/40"
                    }`}
                  >
                    <LayoutGrid size={15} className="text-gray-400 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-gray-900 dark:text-gray-100">
                        {b.name}
                      </span>
                      {b.workspaceName && (
                        <span className="block truncate text-[11.5px] text-gray-500 dark:text-slate-400">
                          {b.workspaceName}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/40">
          <Hint keys="↑↓" label={t("search.hintMove")} />
          <Hint keys="↵" label={t("search.hintOpen")} />
          <Hint keys="esc" label={t("search.hintClose")} />
          {searched && (
            <button
              type="button"
              onClick={() => {
                onSeeAll(query.trim());
                onClose();
              }}
              className="ml-auto flex items-center gap-1.5 text-[11.5px] font-semibold text-[#1A2C5B] dark:text-amber-400 hover:underline"
            >
              {t("search.seeAll")}
              <CornerDownLeft size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-slate-400">
      <kbd className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 border-b-2 rounded px-1.5 py-[1px]">
        {keys}
      </kbd>
      {label}
    </span>
  );
}

export default SearchPalette;
