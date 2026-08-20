"use client";

import React from "react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
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
import { useT } from "@/components/LanguageProvider";

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
  const t = useT();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { anchorRef, menuRef: popupRef, menuStyle } = useAnchoredMenu(isMenuOpen, { align: 'left' });
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
      <div className="px-6 pt-5 pb-3 shrink-0 border-gradient-bottom">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight" style={{ letterSpacing: '-0.025em' }}>
              {boardName}
            </h1>
            <div className="relative" ref={(el) => { menuRef.current = el; anchorRef.current = el; }}>
              <Tooltip content={t("board.options")} side="bottom">
                <button 
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 transition-colors"
                >
                  <MoreHorizontal size={18} />
                </button>
              </Tooltip>
              {isMenuOpen && (
                <div ref={popupRef} style={menuStyle} className="w-48 dropdown-premium z-[60] py-1.5">
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      if (onDuplicateBoard) onDuplicateBoard();
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors rounded-lg mx-0"
                  >
                    {t("board.saveAsTemplate")}
                  </button>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      if (onImportData) onImportData();
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors rounded-lg mx-0"
                  >
                    {t("board.importFromMonday")}
                  </button>
                </div>
              )}
            </div>
          </div>
          <Tooltip content={t("board.automationsTooltip")} side="bottom">
            <button onClick={onShowAutomations} className="btn-automate">
              <Zap size={14} /> {t("board.automate")}
            </button>
          </Tooltip>
        </div>

        {/* View Tabs */}
        <div className="flex items-center space-x-1 bg-gray-100/60 dark:bg-slate-800/40 rounded-full p-1">
          <button
            onClick={() => onSetMainView("board")}
            className={`pill-tab flex items-center gap-1.5 press-effect ${mainView === "board" ? "active" : "text-gray-600 dark:text-gray-400"}`}
          >
            <LayoutList size={14} /> {t("board.mainTable")}
          </button>
          <button
            onClick={() => onSetMainView("kanban")}
            className={`pill-tab flex items-center gap-1.5 press-effect ${mainView === "kanban" ? "active" : "text-gray-600 dark:text-gray-400"}`}
          >
            <Columns3 size={14} /> {t("board.viewKanban")}
          </button>
          <button
            onClick={() => onSetMainView("dashboard")}
            className={`pill-tab flex items-center gap-1.5 press-effect ${mainView === "dashboard" ? "active" : "text-gray-600 dark:text-gray-400"}`}
          >
            <LayoutDashboard size={14} /> {t("board.viewDashboard")}
          </button>
          <button
            onClick={() => onSetMainView("calendar")}
            className={`pill-tab flex items-center gap-1.5 press-effect ${mainView === "calendar" ? "active" : "text-gray-600 dark:text-gray-400"}`}
          >
            <Calendar size={14} /> {t("board.viewCalendar")}
          </button>
          <button
            onClick={() => onSetMainView("gantt")}
            className={`pill-tab flex items-center gap-1.5 press-effect ${mainView === "gantt" ? "active" : "text-gray-600 dark:text-gray-400"}`}
          >
            <GripVertical size={14} /> {t("board.viewGantt")}
          </button>
          <button
            onClick={() => onSetMainView("cards")}
            className={`pill-tab flex items-center gap-1.5 press-effect ${mainView === "cards" ? "active" : "text-gray-600 dark:text-gray-400"}`}
            title={t("board.cardsTooltip")}
          >
            <Smartphone size={14} /> {t("board.viewCards")}
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
