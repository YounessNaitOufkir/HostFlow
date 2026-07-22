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
} from "lucide-react";
import type { Column, Profile } from "@/types";
import FilterBar from "@/components/board/FilterBar";

export type MainView = "board" | "kanban" | "dashboard" | "calendar" | "gantt" | "my_work" | "trash" | "workspace_overview" | "workspace_gantt";

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
}: BoardHeaderProps) {
  return (
    <>
      {/* Board Header */}
      <div className="px-6 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              {boardName}
            </h1>
          </div>
          <button onClick={onShowAutomations} className="btn-automate">
            <Zap size={14} /> Automate
          </button>
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
        </div>
      </div>

      {/* Filter Bar */}
      {(mainView === "board" || mainView === "kanban") && (
        <FilterBar 
          searchQuery={searchQuery}
          setSearchQuery={onSetSearchQuery}
          columns={columns}
          filters={filters}
        />
      )}
    </>
  );
}
