"use client";

import React, { useState, useMemo, useEffect } from "react";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { Board, Workspace } from "@/types";
import { useWorkspaceGanttData } from "@/hooks/useWorkspaceGanttData";
import GanttView from "./GanttView";
import { Check, LayoutList, PanelLeftClose, PanelLeftOpen, Lock } from "lucide-react";
import { GanttSkeleton } from "@/components/skeletons/GanttSkeleton";

interface WorkspaceGanttViewProps {
  allBoards: Board[];
  /** Needed to say which workspace each board comes from. */
  workspaces: Workspace[];
}

export default function WorkspaceGanttView({ allBoards, workspaces }: WorkspaceGanttViewProps) {
  // Default to selecting all boards
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(
    new Set(allBoards.map(b => b.id))
  );

  const { loading, items, groups, itemLinks } = useWorkspaceGanttData(Array.from(selectedBoardIds));
  // Boards are grouped under the workspace they belong to. Across workspaces
  // the names repeat - three different properties can each have a board called
  // "Lancement" - and a flat list gives no way to tell which is which.
  const boardsByWorkspace = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; isPrivate: boolean; boards: Board[] }
    >();
    for (const board of allBoards) {
      const key = board.workspace_id || 'none';
      if (!groups.has(key)) {
        const ws = workspaces.find((w) => w.id === board.workspace_id);
        groups.set(key, {
          name: ws?.name || 'Unknown workspace',
          isPrivate: !!ws?.is_private,
          boards: [],
        });
      }
      groups.get(key)!.boards.push(board);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allBoards, workspaces]);

  // Collapsing is a preference, so it survives navigation and reloads rather
  // than resetting every time the Master Gantt is opened.
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setIsPanelCollapsed(
        localStorage.getItem("hostflow_master_gantt_panel_collapsed") === "1"
      );
    } catch {}
  }, []);

  const togglePanel = () => {
    setIsPanelCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(
          "hostflow_master_gantt_panel_collapsed",
          next ? "1" : "0"
        );
      } catch {}
      return next;
    });
  };

  const toggleBoard = (id: string) => {
    const next = new Set(selectedBoardIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedBoardIds(next);
  };

  // Synthesize a mock board with the union of all columns so GanttView can find the date/timeline columns
  const mockBoard = useMemo(() => {
    const selectedBoards = allBoards.filter(b => selectedBoardIds.has(b.id));
    const allColumns = selectedBoards.flatMap(b => b.columns || []);
    // Deduplicate by ID
    const uniqueColumns = Array.from(new Map(allColumns.map(c => [c.id, c])).values());
    
    return {
      id: "workspace-mock-board",
      name: "Workspace Overview",
      description: "",
      workspace_id: allBoards[0]?.workspace_id || "",
      created_at: new Date().toISOString(),
      columns: uniqueColumns,
    } as unknown as Board;
  }, [allBoards, selectedBoardIds]);

  return (
    <div className="flex h-full w-full bg-white dark:bg-[#181b34]">
      {/* Board Selector Sidebar. Collapses to a narrow rail so the chart can use
          the full width; the toggle stays reachable in both states. */}
      <div
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
              <span className="truncate">Included Boards</span>
            </h3>
          )}
          <button
            type="button"
            onClick={togglePanel}
            aria-expanded={!isPanelCollapsed}
            aria-label={
              isPanelCollapsed ? "Show included boards" : "Hide included boards"
            }
            title={
              isPanelCollapsed ? "Show included boards" : "Hide included boards"
            }
            className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors shrink-0"
          >
            {isPanelCollapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
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

        <div
          className={`flex-1 overflow-y-auto p-2 space-y-1 ${
            isPanelCollapsed ? "hidden" : ""
          }`}
        >
          {allBoards.length === 0 ? (
            <div className="p-4 text-xs text-gray-500 text-center">No boards in workspace</div>
          ) : (
            boardsByWorkspace.map((group) => (
              <div key={group.name} className="pb-1">
                <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {group.isPrivate && <Lock size={9} className="text-amber-500 shrink-0" />}
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
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors text-left ${
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                            : "hover:bg-gray-100 dark:hover:bg-slate-800/80 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <TruncatedText className="truncate pr-2 font-medium">{board.name}</TruncatedText>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-gray-300 dark:border-slate-600"
                        }`}>
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
      </div>

      {/* Gantt Area */}
      <div className="flex-1 overflow-hidden relative">
        {loading ? (
          <GanttSkeleton />
        ) : selectedBoardIds.size === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
            Select at least one board to view the Master Gantt chart.
          </div>
        ) : (
          <GanttView
            board={mockBoard}
            items={items}
            groups={groups}
            itemLinks={itemLinks}
          />
        )}
      </div>
    </div>
  );
}
