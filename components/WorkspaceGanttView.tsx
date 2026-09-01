"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { TruncatedText } from "@/components/ui/TruncatedText";
import {
  Automation,
  Board,
  CellValue,
  DependencyType,
  Item,
  ItemLink,
  Profile,
  Workspace,
} from "@/types";
import { useWorkspaceGanttData } from "@/hooks/useWorkspaceGanttData";
import GanttChart from "@/components/gantt/GanttChart";
import {
  CrossWorkspaceLinkDialog,
  type CrossWorkspaceLinkRequest,
} from "@/components/gantt/CrossWorkspaceLinkDialog";
import {
  Check,
  LayoutList,
  PanelLeftClose,
  PanelLeftOpen,
  Lock,
  Rows3,
  Search,
  X,
} from "lucide-react";
import { GanttSkeleton } from "@/components/skeletons/GanttSkeleton";
import { useT } from "@/components/LanguageProvider";
import type { GanttBoardContext } from "@/lib/gantt/rows";
import { projectRowId } from "@/lib/gantt/rows";
import { GanttPortfolioFilters } from "@/components/gantt/GanttPortfolioFilters";
import {
  filterPortfolioItems,
  assigneesInPortfolio,
  statusesInPortfolio,
  EMPTY_PORTFOLIO_FILTER,
  type PortfolioFilter,
} from "@/lib/gantt/portfolioFilter";

export interface WorkspaceGanttUpdate {
  board: Board;
  automations: Automation[];
  items: Item[];
  itemLinks: ItemLink[];
  itemId: string;
  columnId: string;
  value: CellValue;
}

interface WorkspaceGanttViewProps {
  allBoards: Board[];
  /** Needed to say which workspace each board comes from. */
  workspaces: Workspace[];
  /** Names the owners in the filter menu. */
  profiles?: Profile[];
  /**
   * Writes a cell through the app's single mutation path. Omitted, the chart is
   * read-only and says so rather than leaving it to be discovered.
   */
  onUpdateCell?: (update: WorkspaceGanttUpdate) => void;
  /**
   * Applies a reschedule across whatever boards it touches, as one undoable
   * change. A portfolio drag can push successors that live on another board.
   */
  onRescheduleCells?: (
    items: Item[],
    changes: { itemId: string; columnId: string; value: CellValue }[],
    summary: { movedCount: number; cycleDetected: boolean }
  ) => void;
  /**
   * Creates a dependency drawn between two bars. This is the only place a link
   * spanning two boards can be made: the board Gantt only ever shows one.
   */
  onCreateLink?: (link: {
    sourceId: string;
    targetId: string;
    type: DependencyType;
  }) => void;
  /**
   * Takes the portfolio's own links: the board store this writes through holds
   * only the open board's, which on this screen is none.
   */
  onUpdateLink?: (
    links: ItemLink[],
    linkId: string,
    changes: { type?: DependencyType; lag?: number }
  ) => void;
  onDeleteLink?: (linkId: string) => void;
}

const SELECTION_KEY = "hostflow_master_gantt_boards";
const PANEL_KEY = "hostflow_master_gantt_panel_collapsed";

/**
 * The portfolio view: every board's plan on one timeline.
 *
 * It used to flatten each board's groups into a single list ordered by group
 * position, so one property's "Phase 1" sat between another's with nothing on
 * the row to say which was which - and board names repeat by design, since
 * every property has a "Lancement". Now each board is its own swimlane, headed
 * by a rolled-up project bar labelled `workspace › board`.
 */
export default function WorkspaceGanttView({
  allBoards,
  workspaces,
  profiles = [],
  onUpdateCell,
  onRescheduleCells,
  onCreateLink,
  onUpdateLink,
  onDeleteLink,
}: WorkspaceGanttViewProps) {
  const t = useT();
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(
    () => new Set(allBoards.map((b) => b.id))
  );
  const [boardFilter, setBoardFilter] = useState("");
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<PortfolioFilter>(EMPTY_PORTFOLIO_FILTER);

  // Both the panel state and the board selection survive navigation: rebuilding
  // a twelve-board selection every time the view is opened is not a preference
  // anyone holds.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Read after mount, not in a lazy initialiser: this renders on the server
      // too, where localStorage does not exist, and starting from a different
      // value there is a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPanelCollapsed(localStorage.getItem(PANEL_KEY) === "1");

      const saved = localStorage.getItem(SELECTION_KEY);
      if (saved) {
        const ids: string[] = JSON.parse(saved);
        // Boards deleted since the selection was saved are dropped; a selection
        // that no longer matches any board falls back to everything.
        const known = ids.filter((id) => allBoards.some((b) => b.id === id));
        if (known.length > 0) setSelectedBoardIds(new Set(known));
      }
    } catch {
      /* an unreadable preference is not a reason to fail to render */
    }
    // Only on mount: this restores a preference, it does not track the board list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistSelection = useCallback((next: Set<string>) => {
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(Array.from(next)));
    } catch {
      /* ignore */
    }
  }, []);

  const selectedBoards = useMemo(
    () => allBoards.filter((b) => selectedBoardIds.has(b.id)),
    [allBoards, selectedBoardIds]
  );

  const { loading, items, groups, itemLinks, automationsFor, refresh } =
    useWorkspaceGanttData(selectedBoards);

  const [pendingLink, setPendingLink] = useState<{
    link: { sourceId: string; targetId: string; type: DependencyType };
    request: CrossWorkspaceLinkRequest;
  } | null>(null);

  const workspaceName = useCallback(
    (board: Board) =>
      workspaces.find((w) => w.id === board.workspace_id)?.name ?? t("master.unknownWorkspace"),
    [workspaces, t]
  );

  /**
   * One slice per board, each carrying its own board object - which is what
   * lets the chart resolve an item's timeline column and status palette against
   * the board it actually belongs to, rather than against a merged pile of
   * every selected board's columns.
   */
  const boardsById = useMemo(
    () => new Map(selectedBoards.map((b) => [b.id, b])),
    [selectedBoards]
  );

  // Offered from what is actually on the selected boards, so the menu never
  // lists an owner or a status that would return nothing.
  const assigneeOptions = useMemo(
    () => assigneesInPortfolio(items, boardsById),
    [items, boardsById]
  );
  const statusOptions = useMemo(
    () => statusesInPortfolio(items, boardsById),
    [items, boardsById]
  );

  const visibleItems = useMemo(
    () => filterPortfolioItems(items, boardsById, filter),
    [items, boardsById, filter]
  );

  const contexts = useMemo<GanttBoardContext[]>(
    () =>
      selectedBoards
        .map((board) => ({
          board,
          workspaceName: workspaceName(board),
          groups: groups.filter((g) => g.board_id === board.id),
          items: visibleItems.filter((i) => i.board_id === board.id),
        }))
        .sort(
          (a, b) =>
            a.workspaceName.localeCompare(b.workspaceName) ||
            a.board.name.localeCompare(b.board.name)
        ),
    [selectedBoards, groups, visibleItems, workspaceName]
  );

  const boardsByWorkspace = useMemo(() => {
    const query = boardFilter.trim().toLowerCase();
    const grouped = new Map<
      string,
      { name: string; isPrivate: boolean; boards: Board[] }
    >();

    for (const board of allBoards) {
      const ws = workspaces.find((w) => w.id === board.workspace_id);
      const name = ws?.name || t("master.unknownWorkspace");
      // Matching the workspace keeps a property's boards findable by the
      // property's name, which is how they are actually referred to.
      if (
        query &&
        !board.name.toLowerCase().includes(query) &&
        !name.toLowerCase().includes(query)
      ) {
        continue;
      }

      const key = board.workspace_id || "none";
      if (!grouped.has(key)) {
        grouped.set(key, { name, isPrivate: !!ws?.is_private, boards: [] });
      }
      grouped.get(key)!.boards.push(board);
    }

    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allBoards, workspaces, boardFilter, t]);

  const togglePanel = () => {
    setIsPanelCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PANEL_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleBoard = (id: string) => {
    setSelectedBoardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistSelection(next);
      return next;
    });
  };

  const setAll = (ids: string[]) => {
    const next = new Set(ids);
    setSelectedBoardIds(next);
    persistSelection(next);
  };

  /**
   * Every lane shut, so the portfolio reads as one row per property - the
   * executive view. Not a separate mode: a lane can still be opened from here,
   * which is what makes it useful rather than just smaller.
   */
  const projectRowIds = useMemo(
    () => contexts.map((c) => projectRowId(c.board.id)),
    [contexts]
  );

  const projectsOnly =
    projectRowIds.length > 0 && projectRowIds.every((id) => collapsed.has(id));

  const toggleProjectsOnly = useCallback(() => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const allShut = projectRowIds.length > 0 && projectRowIds.every((id) => next.has(id));
      for (const id of projectRowIds) {
        if (allShut) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [projectRowIds]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const boardOfItem = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      return item ? selectedBoards.find((b) => b.id === item.board_id) : undefined;
    },
    [items, selectedBoards]
  );

  const handleUpdateItem = useMemo(() => {
    if (!onUpdateCell) return undefined;
    return (itemId: string, columnId: string, value: CellValue) => {
      const board = boardOfItem(itemId);
      if (!board) return;
      // Scoped to that board's own items and rules, so a drag here behaves
      // exactly as the same drag would on the board's own Gantt.
      onUpdateCell({
        board,
        automations: automationsFor(board),
        items: items.filter((i) => i.board_id === board.id),
        itemLinks,
        itemId,
        columnId,
        value,
      });
    };
  }, [onUpdateCell, boardOfItem, automationsFor, items, itemLinks]);

  /**
   * Inside one property a cross-board link is unremarkable - the boards are
   * phases of the same job. Across two properties it is a different claim, and
   * one that quietly moves work on a board the person dragging may not be able
   * to open, so it is confirmed rather than just made.
   */
  const handleCreateLink = useMemo(() => {
    if (!onCreateLink) return undefined;

    return (link: { sourceId: string; targetId: string; type: DependencyType }) => {
      const sourceBoard = boardOfItem(link.sourceId);
      const targetBoard = boardOfItem(link.targetId);
      if (!sourceBoard || !targetBoard) return;

      if (sourceBoard.workspace_id === targetBoard.workspace_id) {
        onCreateLink(link);
        refresh();
        return;
      }

      const describe = (itemId: string, board: Board) => ({
        taskName: items.find((i) => i.id === itemId)?.name ?? "Unknown task",
        boardName: board.name,
        workspaceName: workspaceName(board),
      });

      setPendingLink({
        link,
        request: {
          type: link.type,
          source: describe(link.sourceId, sourceBoard),
          target: describe(link.targetId, targetBoard),
        },
      });
    };
  }, [onCreateLink, boardOfItem, items, workspaceName, refresh]);

  const handleUpdateLink = useMemo(() => {
    if (!onUpdateLink) return undefined;
    return (linkId: string, changes: { type?: DependencyType; lag?: number }) => {
      onUpdateLink(itemLinks, linkId, changes);
      refresh();
    };
  }, [onUpdateLink, itemLinks, refresh]);

  const handleDeleteLink = useMemo(() => {
    if (!onDeleteLink) return undefined;
    return (linkId: string) => {
      onDeleteLink(linkId);
      refresh();
    };
  }, [onDeleteLink, refresh]);

  const handleReschedule = useMemo(() => {
    if (!onRescheduleCells) return undefined;
    return (
      changes: { itemId: string; columnId: string; value: CellValue }[],
      summary: { movedCount: number; cycleDetected: boolean }
    ) => onRescheduleCells(items, changes, summary);
  }, [onRescheduleCells, items]);

  const visibleBoardIds = boardsByWorkspace.flatMap((g) => g.boards.map((b) => b.id));

  // Names the exported file after what is actually in it, rather than after a
  // view that could be showing any subset of the portfolio.
  const exportTitle =
    contexts.length === 1
      ? `${contexts[0].workspaceName} - ${contexts[0].board.name}`
      : `Master Gantt - ${contexts.length} boards`;

  return (
    <div className="flex h-full w-full bg-white dark:bg-[#181b34]">
      {/* Board selector. Collapses to a narrow rail so the chart can use the
          full width; the toggle stays reachable in both states. */}
      <div
        role="region"
        aria-label={t("master.includedBoards")}
        className={`${
          isPanelCollapsed ? "w-12" : "w-64"
        } shrink-0 border-r border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 flex flex-col z-20 shadow-[2px_0_10px_rgba(0,0,0,0.05)] dark:shadow-[2px_0_10px_rgba(0,0,0,0.5)] transition-[width] duration-200`}
      >
        <div
          className={`border-b border-gray-200 dark:border-slate-800 flex items-center ${
            isPanelCollapsed ? "justify-center p-3" : "justify-between p-4"
          }`}
        >
          {!isPanelCollapsed && (
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 min-w-0">
              <LayoutList size={16} className="shrink-0" />
              <span className="truncate">{t("master.includedBoards")}</span>
            </h3>
          )}
          <button
            type="button"
            onClick={togglePanel}
            aria-expanded={!isPanelCollapsed}
            aria-label={t(isPanelCollapsed ? "master.showBoards" : "master.hideBoards")}
            title={t(isPanelCollapsed ? "master.showBoards" : "master.hideBoards")}
            className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors shrink-0"
          >
            {isPanelCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {isPanelCollapsed && (
          // Keep the selection legible while collapsed, so it is obvious the
          // chart is filtered rather than simply empty.
          <div className="flex-1 flex flex-col items-center pt-3 gap-1">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              {selectedBoardIds.size}
            </span>
            <span className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
              of {allBoards.length}
            </span>
          </div>
        )}

        {!isPanelCollapsed && (
          <>
            <div className="px-3 pt-3 pb-2 space-y-2">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  type="text"
                  value={boardFilter}
                  onChange={(e) => setBoardFilter(e.target.value)}
                  placeholder={t("master.findBoard")}
                  aria-label={t("master.filterBoards")}
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                {boardFilter && (
                  <button
                    type="button"
                    onClick={() => setBoardFilter("")}
                    aria-label={t("master.clearFilter")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setAll(visibleBoardIds)}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t("master.selectAll")}
                </button>
                <button
                  type="button"
                  onClick={() => setAll([])}
                  className="text-gray-500 dark:text-gray-400 hover:underline"
                >
                  {t("master.clear")}
                </button>
                <span className="ml-auto text-gray-400 dark:text-gray-500 tabular-nums">
                  {selectedBoardIds.size}/{allBoards.length}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 pt-0 space-y-1">
              {allBoards.length === 0 ? (
                <div className="p-4 text-xs text-gray-500 text-center">
                  {t("master.noBoards")}
                </div>
              ) : boardsByWorkspace.length === 0 ? (
                <div className="p-4 text-xs text-gray-500 text-center">
                  {t("master.noMatch", { query: boardFilter })}
                </div>
              ) : (
                boardsByWorkspace.map((group) => (
                  <div key={group.name} className="pb-1">
                    <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {group.isPrivate && (
                        <Lock size={9} className="text-amber-500 shrink-0" />
                      )}
                      <TruncatedText className="truncate">{group.name}</TruncatedText>
                      <span className="ml-auto shrink-0 font-semibold tabular-nums">
                        {group.boards.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {group.boards.map((board) => {
                        const isSelected = selectedBoardIds.has(board.id);
                        return (
                          <button
                            key={board.id}
                            onClick={() => toggleBoard(board.id)}
                            aria-pressed={isSelected}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors text-left ${
                              isSelected
                                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                : "hover:bg-gray-100 dark:hover:bg-slate-800/80 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            <TruncatedText className="truncate pr-2 font-medium">
                              {board.name}
                            </TruncatedText>
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? "bg-blue-500 border-blue-500 text-white"
                                  : "border-gray-300 dark:border-slate-600"
                              }`}
                            >
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
        {loading ? (
          <GanttSkeleton />
        ) : selectedBoardIds.size === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
            {t("master.selectOne")}
          </div>
        ) : (
          <GanttChart
            contexts={contexts}
            itemLinks={itemLinks}
            showProjectRows
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            onUpdateItem={handleUpdateItem}
            onRescheduleItems={handleReschedule}
            toolbarExtras={
              <>
                <button
                  type="button"
                  onClick={toggleProjectsOnly}
                  aria-pressed={projectsOnly}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md shadow-sm transition-colors text-sm font-medium ${
                    projectsOnly
                      ? "bg-blue-50 dark:bg-blue-900/25 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                      : "bg-white dark:bg-[#1e2333] border-gray-200 dark:border-[#2d3555] hover:bg-gray-50 dark:hover:bg-[#252a3f] text-gray-700 dark:text-gray-200"
                  }`}
                  title={t("master.projectsOnlyHint")}
                >
                  <Rows3
                    size={14}
                    className={projectsOnly ? "" : "text-gray-500 dark:text-gray-400"}
                  />
                  {t("master.projectsOnly")}
                </button>

                <GanttPortfolioFilters
                  filter={filter}
                  onChange={setFilter}
                  assigneeIds={assigneeOptions}
                  profiles={profiles}
                  statuses={statusOptions}
                  showing={{ shown: visibleItems.length, total: items.length }}
                />
              </>
            }
            onCreateLink={handleCreateLink}
            onUpdateLink={handleUpdateLink}
            onDeleteLink={handleDeleteLink}
            storageKey="master"
            exportTitle={exportTitle}
            readOnlyReason={
              handleUpdateItem
                ? undefined
                : t("master.readOnlyReason")
            }
            emptyMessage={
              <>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
                  {t("master.emptyTitle")}
                </h2>
                <p className="text-gray-500 dark:text-gray-400">
                  {t("master.emptyBody")}
                </p>
              </>
            }
          />
        )}
      </div>

      {pendingLink && (
        <CrossWorkspaceLinkDialog
          request={pendingLink.request}
          onCancel={() => setPendingLink(null)}
          onConfirm={() => {
            onCreateLink?.(pendingLink.link);
            setPendingLink(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
