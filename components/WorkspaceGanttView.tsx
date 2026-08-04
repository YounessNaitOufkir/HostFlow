"use client";

import React, { useState, useMemo } from "react";
import { Board } from "@/types";
import { useWorkspaceGanttData } from "@/hooks/useWorkspaceGanttData";
import GanttView from "./GanttView";
import { Check, LayoutList } from "lucide-react";
import { GanttSkeleton } from "@/components/skeletons/GanttSkeleton";

interface WorkspaceGanttViewProps {
  allBoards: Board[];
}

export default function WorkspaceGanttView({ allBoards }: WorkspaceGanttViewProps) {
  // Default to selecting all boards
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(
    new Set(allBoards.map(b => b.id))
  );

  const { loading, items, groups, itemLinks } = useWorkspaceGanttData(Array.from(selectedBoardIds));

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
      {/* Board Selector Sidebar */}
      <div className="w-64 shrink-0 border-r border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 flex flex-col z-20 shadow-[2px_0_10px_rgba(0,0,0,0.05)] dark:shadow-[2px_0_10px_rgba(0,0,0,0.5)]">
        <div className="p-4 border-b border-gray-200 dark:border-slate-800">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <LayoutList size={16} />
            Included Boards
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {allBoards.length === 0 ? (
            <div className="p-4 text-xs text-gray-500 text-center">No boards in workspace</div>
          ) : (
            allBoards.map(board => {
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
                  <span className="truncate pr-2 font-medium">{board.name}</span>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-gray-300 dark:border-slate-600"
                  }`}>
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </div>
                </button>
              );
            })
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
