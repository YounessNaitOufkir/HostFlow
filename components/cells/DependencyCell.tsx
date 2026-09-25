"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { Item, Column } from "@/types";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { Link2, AlertCircle, AlertTriangle, X, CalendarClock } from "lucide-react";
import { useBoardStore } from "@/hooks/useBoardStore";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useBoardsQuery, useWorkspacesQuery } from "@/hooks/queries/useGlobalQueries";
import {
  useDependencyItemSearch,
  useItemsByIds,
  MIN_SEARCH_LENGTH,
  type DependencyCandidate,
} from "@/hooks/queries/useDependencySearch";
import {
  pickableBoards,
  originOf,
  chipPrefix,
  chipTitle,
  groupCandidates,
  type DependencyOrigin,
} from "@/lib/dependencies/scope";
import { CrossWorkspaceLinkDialog } from "@/components/gantt/CrossWorkspaceLinkDialog";
import { useT } from "@/components/LanguageProvider";

interface DependencyCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  boardItems: Item[];
  columns?: Column[];
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
}

export default function DependencyCell({ item, column, onUpdate, boardItems, columns = [], activeStatusId, setActiveStatusId }: DependencyCellProps) {
  const t = useT();

  // Value is an array of dependent Item IDs
  const value: string[] = Array.isArray(item.column_values?.[column.id])
    ? item.column_values[column.id]
    : [];

  const isOpen = activeStatusId === item.id + column.id;
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(isOpen, { align: 'left' });
  
  const setIsOpen = (open: boolean) => {
    if (setActiveStatusId) {
      setActiveStatusId(open ? item.id + column.id : null);
    }
  };

  const dropdownRef = useRef<HTMLDivElement>(null);

  const [conflictTarget, setConflictTarget] = useState<Item | null>(null);
  /** Held back until confirmed: a link that reaches into another property. */
  const [pendingCross, setPendingCross] = useState<DependencyCandidate | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setConflictTarget(null); // Clear error when closed
      setSearchQuery(""); // Clear search
      return;
    }
    
    if (inputRef.current) {
      inputRef.current.focus();
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Find primary date column for conflict checking
  const dateCol = columns?.find((c) => c.type === "date" || c.type === "timeline");

  const getItemDates = (i: Item) => {
    if (!dateCol) return null;
    const val = i.column_values?.[dateCol.id];
    if (!val) return null;
    if (dateCol.type === "date") return { start: new Date(val), end: new Date(val) };
    if (dateCol.type === "timeline" && val.start && val.end) {
      return { start: new Date(val.start), end: new Date(val.end) };
    }
    return null;
  };

  const myDates = getItemDates(item);

  const commitToggle = (targetItemId: string, isRemoving: boolean) => {
    setConflictTarget(null);
    setPendingCross(null);
    const newDeps = isRemoving
      ? value.filter((id) => id !== targetItemId)
      : [...value, targetItemId];
      
    // Execute DB operations in background without blocking UI update
    if (isRemoving) {
      supabase.from("item_links")
        .delete()
        .eq("source_item_id", targetItemId)
        .eq("target_item_id", item.id)
        .eq("link_type", "dependency")
        .then();
    } else {
      supabase.from("item_links")
        .insert({
          source_item_id: targetItemId,
          target_item_id: item.id,
          link_type: "dependency"
        })
        .then();
    }
      
    onUpdate(item.id, column.id, newDeps);
    if (!isRemoving) {
      setSearchQuery("");
    }
  };

  const toggleDependency = async (targetItemId: string) => {
    const isRemoving = value.includes(targetItemId);

    if (!isRemoving) {
      const targetItem = boardItems.find((i) => i.id === targetItemId);
      if (targetItem) {
        const depDates = getItemDates(targetItem);

        // If I depend on dep, dep must finish BEFORE my start date.
        // Even finishing on the same day is a conflict, because I can only start the next day.
        if (myDates && depDates && depDates.end >= myDates.start) {
          setConflictTarget(targetItem);
          return; // Stop the user
        }
      }

      // Inside one property a cross-board link is unremarkable. Across two it
      // is a different claim - it moves work someone else owns, possibly on a
      // board this person cannot open - so it is confirmed, exactly as the
      // Master Gantt confirms the same link made by dragging.
      const candidate = lookup.get(targetItemId);
      if (candidate && originFor(candidate) === "other-workspace") {
        setPendingCross(candidate);
        return;
      }
    }

    commitToggle(targetItemId, isRemoving);
  };

  const handleAdjustDates = () => {
    if (!conflictTarget || !dateCol || !myDates) return;
    
    const depDates = getItemDates(conflictTarget);
    if (!depDates) return;

    // Calculate shift in days to push my start date to the day AFTER the parent's end date
    const shiftMs = depDates.end.getTime() - myDates.start.getTime();
    const shiftDays = Math.round(shiftMs / (1000 * 60 * 60 * 24)) + 1;

    let newVal;
    const addDays = (date: Date, days: number) => {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    if (dateCol.type === "date") {
      newVal = addDays(myDates.start, shiftDays);
    } else if (dateCol.type === "timeline") {
      newVal = {
        start: addDays(myDates.start, shiftDays),
        end: addDays(myDates.end, shiftDays)
      };
    }

    // 1. Update the date column to the new shifted dates
    onUpdate(item.id, dateCol.id, newVal);

    // 2. Create the dependency link
    const newDeps = [...value, conflictTarget.id];
    supabase.from("item_links")
      .insert({
        source_item_id: conflictTarget.id,
        target_item_id: item.id,
        link_type: "dependency"
      })
      .then();
      
    onUpdate(item.id, column.id, newDeps);
    setConflictTarget(null);
  };


  // Boards and workspaces are already cached globally, so reading them here
  // costs nothing and saves threading two more props through CellRenderer and
  // every table row above it.
  const { data: allBoards = [] } = useBoardsQuery();
  const { data: allWorkspaces = [] } = useWorkspacesQuery();
  const boardRefs = useMemo(
    () => pickableBoards(allBoards, allWorkspaces),
    [allBoards, allWorkspaces]
  );

  // A dependency on another board is an id and nothing else: the task it points
  // at was never loaded, so its name has to be fetched before a chip can say
  // anything.
  const foreignIds = useMemo(
    () => value.filter((id) => !boardItems.some((i) => i.id === id)),
    [value, boardItems]
  );
  const { data: foreignItems = [] } = useItemsByIds(foreignIds);

  const { data: searchHits = [], isFetching: searching } = useDependencyItemSearch(
    searchQuery,
    isOpen
  );

  /**
   * Every task this cell might need to name, whichever board it came from.
   *
   * Left to the React Compiler rather than wrapped in useMemo: the query hooks
   * hand back a fresh array each render, so a manual memo here cannot be
   * preserved and opts the whole component out of compilation.
   */
  const lookup = (() => {
    const map = new Map<string, DependencyCandidate>();
    for (const i of boardItems) map.set(i.id, { id: i.id, name: i.name, board_id: i.board_id });
    for (const i of foreignItems) map.set(i.id, i);
    for (const i of searchHits) map.set(i.id, i);
    return map;
  })();

  const originFor = (candidate: DependencyCandidate): DependencyOrigin =>
    originOf(item.board_id, candidate.board_id, boardRefs);

  const dependentItems = useMemo(
    () =>
      value
        .map((id) => lookup.get(id))
        .filter((dep): dep is DependencyCandidate => Boolean(dep))
        .map((dep) => {
          const local = boardItems.find((i) => i.id === dep.id);
          const depDates = local ? getItemDates(local) : null;
          // If I depend on dep, dep must finish BEFORE my start date, so an end
          // on or after my start is a conflict. Only checkable for tasks on this
          // board: another board's dates are in its own columns, which are not
          // loaded. The Gantt's broken-links count covers the rest.
          const hasConflict = Boolean(myDates && depDates && depDates.end >= myDates.start);
          const origin = originOf(item.board_id, dep.board_id, boardRefs);
          return {
            ...dep,
            hasConflict,
            origin,
            prefix: chipPrefix(origin, boardRefs.get(dep.board_id)),
            title: chipTitle(dep.name, origin, boardRefs.get(dep.board_id)),
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, lookup, boardItems, myDates, boardRefs, item.board_id]
  );

  /**
   * What the picker offers: this board's tasks always, plus anything the search
   * turned up elsewhere. Typing filters both; with the box empty only this board
   * is listed, since offering the whole account unprompted is a wall.
   */
  const candidateGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const local: DependencyCandidate[] = boardItems
      .filter((i) => i.id !== item.id)
      .filter((i) => !query || i.name.toLowerCase().includes(query))
      .map((i) => ({ id: i.id, name: i.name, board_id: i.board_id }));

    const seen = new Set(local.map((i) => i.id));
    const remote = searchHits.filter(
      (hit) => hit.id !== item.id && !seen.has(hit.id)
    );

    return groupCandidates(item.board_id, [...local, ...remote], boardRefs);
  }, [boardItems, searchHits, searchQuery, item.id, item.board_id, boardRefs]);

  const totalCandidates = candidateGroups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div ref={anchorRef} className={`${column.width ? '' : 'w-48'} border-r border-gray-200 dark:border-slate-700 shrink-0 relative flex items-center p-1.5 cursor-pointer transition-colors ${isOpen ? "z-50" : ""}`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      {/* Was a div: the badges inside are static text, not nested controls,
          and the search popover below is a sibling — safe to be a real
          button. */}
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="w-full h-full flex items-center overflow-x-auto overflow-y-hidden no-scrollbar text-left"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        {dependentItems.length > 0 ? (
          <div className="flex gap-1.5 items-center px-1">
            {dependentItems.map((dep) => (
              <TruncatedText
                key={dep.id}
                tooltip={
                  dep.hasConflict
                    ? `${dep.title} — ${t("dep.conflictTooltip")}`
                    : dep.title
                }
                className={`text-[13px] px-2.5 py-0.5 rounded-[4px] truncate max-w-[190px] shrink-0 ${
                  dep.hasConflict
                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 ring-1 ring-red-500"
                    : dep.origin === "other-workspace"
                      ? "bg-[#fdf3e3] text-[#7a5310] ring-1 ring-[#f0d9ac] dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800"
                      : dep.origin === "same-workspace"
                        ? "bg-[#eef2f7] text-[#384252] ring-1 ring-[#d3dbe6] dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600"
                        : "bg-[#cce5ff] text-[#323338] dark:bg-[#cce5ff]/20 dark:text-[#cce5ff]"
                }`}
              >
                {dep.hasConflict && <AlertTriangle size={12} strokeWidth={2.25} className="inline-block align-[-2px] mr-1" aria-hidden />}
                {/* The board is always named for anything off-board, and the
                    property joins it once the link crosses one - three boards
                    are called "Lancement", so the board alone stops
                    identifying anything. */}
                {dep.prefix && <span className="opacity-60">{dep.prefix} · </span>}
                {dep.name}
              </TruncatedText>
            ))}
          </div>
        ) : (
          <div className="w-full text-center text-gray-400 dark:text-gray-500 text-xl pb-1 opacity-0 hover:opacity-100 transition-opacity">
            +
          </div>
        )}
      </button>

      {isOpen && (
        <div
          ref={(el) => { dropdownRef.current = el; menuRef.current = el; }}
          style={menuStyle}
          className="w-72 dropdown-menu py-1.5 z-[60] shadow-xl border border-gray-100 dark:border-slate-700/60 rounded-lg overflow-hidden bg-white dark:bg-[#1e2333]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 pb-2 mb-1 border-b border-gray-100 dark:border-slate-800">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("dep.search")}
              className="w-full px-2 py-1.5 text-sm border border-blue-400 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-800 dark:text-white"
            />
            {/* Said once, under the box rather than under the results: at the
                bottom of a scrolling list it sat below eight rows, which is
                nowhere. */}
            <p className="px-0.5 pt-1.5 text-[11px] leading-snug text-gray-400 dark:text-gray-500">
              {searchQuery.trim().length < MIN_SEARCH_LENGTH
                ? t("dep.hint")
                : searching
                  ? t("dep.searchingAll")
                  : totalCandidates === 1
                    ? t("dep.matchesOne")
                    : t("dep.matches", { count: totalCandidates })}
            </p>
          </div>
          
          <div className="max-h-72 overflow-y-auto px-1 py-1">
            {candidateGroups.map((group) => (
              <div key={group.boardId}>
                {/* Grouped rather than flat because the same task name recurs
                    across properties - each "Lancement" has a "Permis" - and a
                    flat list of identical names is a coin toss. */}
                <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 truncate">
                    {group.boardId === item.board_id ? t("dep.thisBoard") : group.heading}
                  </span>
                  {group.origin === "other-workspace" && (
                    <span className="flex items-center gap-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/25 rounded-full px-2 py-0.5">
                      <AlertCircle size={10} />
                      {t("dep.otherProperty")}
                    </span>
                  )}
                </div>

                {group.items.map((otherItem) => {
                  const isSelected = value.includes(otherItem.id);
                  return (
                    <div
                      key={otherItem.id}
                      onClick={() => toggleDependency(otherItem.id)}
                      className="px-3 py-2 text-sm cursor-pointer flex items-center transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md group"
                    >
                      <div
                        className={`w-4 h-4 rounded-sm mr-3 border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? "bg-blue-500 border-blue-500 text-white"
                            : "bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600"
                        }`}
                      >
                        {isSelected && <span className="text-[10px]">✓</span>}
                      </div>
                      <TruncatedText className="text-gray-700 dark:text-gray-200 truncate">
                        {otherItem.name}
                      </TruncatedText>
                    </div>
                  );
                })}
              </div>
            ))}

            {totalCandidates === 0 && (
              <div className="px-3 py-4 text-center text-sm text-gray-400">
                {searching ? t("dep.searching") : t("dep.noneFound")}
              </div>
            )}
          </div>
        </div>
      )}
      {isMounted && document.body && createPortal(
        <>
          {/* The same confirmation the Master Gantt shows for the same link,
              because it is the same claim wherever it is made. */}
          {pendingCross && (
            <CrossWorkspaceLinkDialog
              request={{
                type: "FS",
                source: {
                  taskName: pendingCross.name,
                  boardName: boardRefs.get(pendingCross.board_id)?.name ?? "",
                  workspaceName: boardRefs.get(pendingCross.board_id)?.workspaceName ?? "",
                },
                target: {
                  taskName: item.name,
                  boardName: boardRefs.get(item.board_id)?.name ?? "",
                  workspaceName: boardRefs.get(item.board_id)?.workspaceName ?? "",
                },
              }}
              onConfirm={() => commitToggle(pendingCross.id, false)}
              onCancel={() => setPendingCross(null)}
            />
          )}
          {conflictTarget && (
            <div key="conflict-modal" className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-0">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setConflictTarget(null)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0.4, duration: 0.5 }}
                className="relative w-full max-w-md bg-white dark:bg-[#1e2333] rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700/50"
              >
                <div className="p-6">
                  <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                    <CalendarClock className="text-amber-600 dark:text-amber-400 w-6 h-6" />
                  </div>
                  
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {t("dep.conflictTitle")}
                  </h3>
                  
                  <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-6">
                    {t("dep.conflictBody", { task: conflictTarget.name })}
                  </p>
                  
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setConflictTarget(null)}
                      className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors shadow-sm"
                    >
                      {t("dep.conflictCancel")}
                    </button>
                    <button
                      onClick={handleAdjustDates}
                      className="px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      {t("dep.conflictAdjust")}
                    </button>
                  </div>
                </div>
                
                {/* Close button top right */}
                <button
                  onClick={() => setConflictTarget(null)}
                  className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  );
}
