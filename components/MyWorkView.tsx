"use client";

import React from "react";
import { Item, Board, STATUS_OPTIONS } from "@/types";
import { LayoutDashboard, AlertCircle } from "lucide-react";

interface MyWorkViewProps {
  items: Item[];
  boards: Board[];
  onSelectItem: (item: Item) => void;
  /**
   * My Work is where a signed-in user lands when there is no previous location
   * to restore, so its empty state has to lead somewhere rather than being a
   * dead end.
   */
  onBrowseWorkspaces?: () => void;
}

export default function MyWorkView({ items, boards, onSelectItem, onBrowseWorkspaces }: MyWorkViewProps) {
  // Group items by board
  const itemsByBoard: Record<string, Item[]> = {};
  items.forEach((item) => {
    if (!itemsByBoard[item.board_id]) {
      itemsByBoard[item.board_id] = [];
    }
    itemsByBoard[item.board_id].push(item);
  });

  const getBoardName = (boardId: string) => {
    const board = boards.find((b) => b.id === boardId);
    return board ? board.name : "Unknown Board";
  };

  const getStatusChip = (item: Item, boardId: string) => {
    const board = boards.find((b) => b.id === boardId);
    if (!board) return null;
    const statusCol = board.columns.find((c) => c.type === "status");
    if (!statusCol) return null;

    const val = item.column_values?.[statusCol.id] || "Empty";
    const opt = STATUS_OPTIONS.find((o) => o.label === val);
    const bgClass = opt ? opt.color : "bg-gray-200 dark:bg-slate-600";

    return (
      <span className={`${bgClass} text-white text-xs font-medium px-2.5 py-1 rounded-full`}>
        {val}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-slate-800 overflow-y-auto">
      <div className="p-8 pb-4">
        <div className="flex items-center space-x-3 text-[#1A2C5B] dark:text-white">
          <LayoutDashboard size={32} />
          <h1 className="text-3xl font-bold tracking-tight">My Work</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-2 ml-1">
          A unified view of all tasks assigned to you across all workspaces.
        </p>
      </div>

      <div className="p-8 pt-4 flex-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500 bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-none border border-gray-100 dark:border-slate-700">
            <AlertCircle size={48} className="mb-4 text-gray-300" />
            <p className="text-lg font-medium">You&apos;re all caught up!</p>
            <p className="text-sm">No tasks are currently assigned to you.</p>
            {onBrowseWorkspaces && (
              <button
                onClick={onBrowseWorkspaces}
                className="mt-5 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              >
                Browse workspaces
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.keys(itemsByBoard).map((boardId) => (
              <div key={boardId} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-600 overflow-hidden">
                <div className="bg-[#1A2C5B]/5 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-600 px-6 py-4">
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                    {getBoardName(boardId)}
                  </h2>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {itemsByBoard[boardId].map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onSelectItem(item)}
                      className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-6 h-6 rounded border border-gray-300 dark:border-slate-500 bg-gray-50 dark:bg-slate-800 flex flex-col justify-between p-0.5 group-hover:border-blue-400">
                          <div className="h-px bg-gray-300 group-hover:bg-blue-400"></div>
                          <div className="h-px bg-gray-300 group-hover:bg-blue-400"></div>
                          <div className="h-px bg-gray-300 group-hover:bg-blue-400"></div>
                        </div>
                        <span className="text-[15px] font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 transition-colors">
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4">
                        {getStatusChip(item, boardId)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
