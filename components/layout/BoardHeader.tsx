"use client";

import React from "react";
import {
  LayoutList,
  Columns3,
  LayoutDashboard,
  Calendar,
  GripVertical,
  Filter,
  Zap,
  MoreHorizontal,
  Smartphone,
} from "lucide-react";
import type { Column, Profile } from "@/types";
import { Tooltip } from "@/components/ui/Tooltip";
import FilterBar from "@/components/board/FilterBar";

export type MainView = "board" | "kanban" | "dashboard" | "calendar" | "gantt" | "cards" | "my_work" | "trash" | "workspace_overview" | "workspace_gantt";

interface BoardHeaderProps {
  boardName: string;
  mainView: MainView;
  columns: Column[];
  profiles: Profile[];
  searchQuery: string;

  filters: any; // Using any for simplicity instead of importing UseFiltersReturn to avoid circular deps if any

  onSetMainView: (view: MainView) => void;
  onSetSearchQuery: (val: string) => void;
  onShowAutomations: () => void;
  hiddenColumns?: string[];
  onToggleColumnVisibility?: (columnId: string) => void;
  onAddTask?: () => void;
  onDuplicateBoard?: () => void;
  onImportData?: () => void;
}

export default function BoardHeader({
  boardName,
  mainView,
  columns,
  profiles,
  searchQuery,
  filters,
  onSetMainView,
  onSetSearchQuery,
  onShowAutomations,
  hiddenColumns = [],
  onToggleColumnVisibility,
  onAddTask,
  onDuplicateBoard,
  onImportData,
}: BoardHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  return (
    <>
      {/* Board Header */}
      <div className="px-6 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              {boardName}
            </h1>
            <div className="relative" ref={menuRef}>
              <Tooltip content="Board options" side="bottom">
                <button 
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 transition-colors"
                >
                  <MoreHorizontal size={18} />
                </button>
              </Tooltip>
              {isMenuOpen && (
                <div className="absolute top-full mt-1 left-0 w-48 bg-white dark:bg-[#25284a] border border-gray-200 dark:border-slate-700 rounded shadow-lg z-50 py-1">
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      if (onDuplicateBoard) onDuplicateBoard();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50"
                  >
                    Save as Template (Duplicate)
                  </button>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      if (onImportData) onImportData();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50"
                  >
                    Import from Monday.com
                  </button>
                </div>
              )}
            </div>
          </div>
          <Tooltip content="Board automations & rules" side="bottom">
            <button onClick={onShowAutomations} className="btn-automate">
              <Zap size={14} /> Automate
            </button>
          </Tooltip>
        </div>

        {/* View Tabs */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onSetMainView("board")}
            className={`view-tab ${mainView === "board" ? "active" : ""}`}
          >
            <LayoutList size={14} /> Main Table
          </button>
          <button
            onClick={() => onSetMainView("kanban")}
            className={`view-tab ${mainView === "kanban" ? "active" : ""}`}
          >
            <Columns3 size={14} /> Kanban
          </button>
          <button
            onClick={() => onSetMainView("dashboard")}
            className={`view-tab ${mainView === "dashboard" ? "active" : ""}`}
          >
            <LayoutDashboard size={14} /> Dashboard
          </button>
          <button
            onClick={() => onSetMainView("calendar")}
            className={`view-tab ${mainView === "calendar" ? "active" : ""}`}
          >
            <Calendar size={14} /> Calendar
          </button>
          <button
            onClick={() => onSetMainView("gantt")}
            className={`view-tab ${mainView === "gantt" ? "active" : ""}`}
          >
            <GripVertical size={14} /> Gantt
          </button>
          <button
            onClick={() => onSetMainView("cards")}
            className={`view-tab ${mainView === "cards" ? "active" : ""}`}
            title="Mobile-friendly touch cards view"
          >
            <Smartphone size={14} /> Cards
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {(mainView === "board" || mainView === "kanban" || mainView === "cards") && (
        <FilterBar 
          searchQuery={searchQuery}
          setSearchQuery={onSetSearchQuery}
          columns={columns}
          filters={filters}
          hiddenColumns={hiddenColumns}
          onToggleColumnVisibility={onToggleColumnVisibility}
          onAddTask={onAddTask}
        />
      )}
    </>
  );
}
