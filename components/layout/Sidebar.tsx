"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  Plus,
  Bell,
  Pencil,
  Layout,
  Trash2,
  ChevronDown,
  Briefcase,
  LayoutGrid,
  CalendarDays,
} from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Board, Workspace, Profile } from "@/types";
import NotificationsMenu from "@/components/NotificationsMenu";
import ProfileMenu from "@/components/ProfileMenu";

interface SidebarProps {
  // Data
  profile: Profile | null;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  boards: Board[];
  activeBoard: Board | null;
  mainView: string;
  showWorkspaceSidebar: boolean;

  // Actions
  onToggleSidebar: () => void;
  onSwitchBoard: (board: Board | null) => void;
  onSetMainView: (view: any) => void;
  onCreateBoard: () => void;
  onRenameBoard: (board: Board) => void;
  onDeleteBoard: (board: Board) => void;
  onSelectWorkspace: (ws: Workspace) => void;
  onRenameWorkspace: (ws: Workspace) => void;
  onDeleteWorkspace: (ws: Workspace) => void;
  onCreateWorkspace: () => void;
  onSignOut: () => void;
  onOpenAdmin: () => void;
  onOpenProfileSettings: () => void;
  onNotificationClick: (boardId?: string, itemId?: string) => void;
  onDuplicateWorkspace?: (ws: Workspace) => void;
  onImportData?: () => void;
}

export default function Sidebar({
  profile,
  workspaces,
  activeWorkspace,
  boards,
  activeBoard,
  mainView,
  showWorkspaceSidebar,
  onToggleSidebar,
  onSwitchBoard,
  onSetMainView,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  onSelectWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onCreateWorkspace,
  onSignOut,
  onOpenAdmin,
  onOpenProfileSettings,
  onNotificationClick,
}: SidebarProps) {
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const workspacePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (workspacePickerRef.current && !workspacePickerRef.current.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visibleBoards = activeWorkspace
    ? boards.filter((b) => b.workspace_id === activeWorkspace.id)
    : boards;

  return (
    <>
      {/* ======================================= */}
      {/* 1. Icon Rail (left-most 60px sidebar)  */}
      {/* ======================================= */}
      <div className="w-[60px] bg-[#1A2C5B] text-white flex flex-col items-center py-4 justify-between shrink-0 relative z-50">
        <div className="flex flex-col items-center space-y-3 w-full">
          <Tooltip content="Toggle Sidebar" side="right">
            <div
              className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#F5A623] to-[#E09015] flex items-center justify-center font-bold text-lg select-none cursor-pointer hover:from-[#FFB540] hover:to-[#F5A623] transition-all shadow-lg shadow-amber-500/30 press-effect text-white"
              onClick={onToggleSidebar}
            >
              H
            </div>
          </Tooltip>
          <div className="w-8 border-t border-white/10 my-1"></div>
          <Tooltip content="My Work" side="right">
            <div
              onClick={() => onSetMainView(mainView === "my_work" ? "board" : "my_work")}
              className={`w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer transition-all ${
                mainView === "my_work"
                  ? "bg-white/15 text-white shadow-inner"
                  : "text-white/60 hover:text-white hover:bg-white/8"
              }`}
            >
              <LayoutDashboard size={20} />
            </div>
          </Tooltip>
          <Tooltip content="Trash Bin" side="right">
            <div
              onClick={() => onSetMainView(mainView === "trash" ? "board" : "trash")}
              className={`w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer transition-all ${
                mainView === "trash"
                  ? "bg-red-500/20 text-red-400 shadow-inner"
                  : "text-white/60 hover:text-white hover:bg-white/8"
              }`}
            >
              <Trash2 size={20} />
            </div>
          </Tooltip>
        </div>
        <div className="flex flex-col items-center space-y-3">
          <Tooltip content="Notifications" side="right">
            <div>
              {profile ? (
                <NotificationsMenu userId={profile.id} onNotificationClick={onNotificationClick} />
              ) : (
                <div className="w-10 h-10 flex items-center justify-center rounded-lg text-white/40 cursor-default">
                  <Bell size={20} />
                </div>
              )}
            </div>
          </Tooltip>
          <div>
            {profile ? (
              <ProfileMenu profile={profile} onSignOut={onSignOut} onOpenAdmin={onOpenAdmin} onOpenProfileSettings={onOpenProfileSettings} />
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse"></div>
            )}
          </div>
        </div>
      </div>

      {/* ======================================= */}
      {/* 2. Workspace Sidebar (board list)       */}
      {/* ======================================= */}
      {showWorkspaceSidebar && (
        <div className="w-[260px] bg-white/95 dark:bg-[#1e2140]/95 backdrop-blur-xl border-r border-gray-200/80 dark:border-slate-700/50 flex flex-col shrink-0 z-10">
          {/* Workspace Picker */}
          <div 
            ref={workspacePickerRef}
            className="h-[52px] border-b border-gray-200 dark:border-slate-700/50 flex items-center px-4 font-semibold text-[13px] text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors relative"
            onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
          >
            <Briefcase size={15} className="mr-2.5 text-blue-500" />
            <span className="truncate flex-1">
              {activeWorkspace ? activeWorkspace.name : "Main Workspace"}
            </span>
            <ChevronDown
              size={13}
              className={`text-gray-400 dark:text-gray-500 transition-transform ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`}
            />

            {isWorkspaceMenuOpen && (
              <div 
                className="absolute top-full left-0 w-full dropdown-menu rounded-t-none z-50 shadow-xl bg-white dark:bg-[#252849] border border-gray-200 dark:border-slate-700/50"
                onClick={(e) => e.stopPropagation()}
              >
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/[0.04] text-[13px] group/ws flex justify-between items-center transition-colors"
                >
                  <div
                    className="flex-1 cursor-pointer truncate mr-2 text-gray-700 dark:text-gray-300"
                    onClick={() => {
                      onSelectWorkspace(ws);
                      onSwitchBoard(null);
                      setIsWorkspaceMenuOpen(false);
                    }}
                  >
                    {ws.name}
                  </div>
                  <div className="hidden group-hover/ws:flex items-center gap-2">
                    <Pencil
                      size={13}
                      className="text-gray-400 hover:text-blue-500 cursor-pointer transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRenameWorkspace(ws);
                      }}
                    />
                    {profile?.role === "admin" && (
                      <Trash2
                        size={13}
                        className="text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteWorkspace(ws);
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
              <div
                onClick={() => {
                  onCreateWorkspace();
                  setIsWorkspaceMenuOpen(false);
                }}
                className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-white/[0.04] text-[13px] text-blue-600 dark:text-blue-400 flex items-center cursor-pointer transition-colors"
              >
                <Plus size={13} className="mr-1.5" /> New Workspace
              </div>
            </div>
            )}
          </div>

          {/* Board List */}
          <div className="flex-1 overflow-y-auto py-3">
            {/* Dashboards Section */}
            <div className="px-4 mb-2 mt-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex justify-between items-center">
              <span>Dashboards</span>
            </div>
            
            <div 
              className={`group flex items-center px-4 py-2 cursor-pointer transition-colors ${!activeBoard && mainView === 'workspace_gantt' ? 'bg-[#cce5ff] dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-white/[0.04]'}`}
              onClick={() => {
                onSwitchBoard(null);
                onSetMainView("workspace_gantt");
              }}
            >
              <CalendarDays size={15} className={`mr-2 ${!activeBoard && mainView === 'workspace_gantt' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
              <span className={`text-[13px] truncate ${!activeBoard && mainView === 'workspace_gantt' ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                Master Gantt Chart
              </span>
            </div>

            {/* Boards Section */}
            <div className="px-4 mb-2 mt-5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex justify-between items-center">
              <span>Boards</span>
              <button
                onClick={onCreateBoard}
                className="hover:bg-gray-100 dark:hover:bg-white/[0.06] p-1 rounded transition-colors text-gray-400 hover:text-blue-500"
                title="Create Board"
              >
                <Plus size={14} />
              </button>
            </div>

            <div 
              className={`group flex items-center px-4 py-2 cursor-pointer transition-colors ${!activeBoard && mainView === 'workspace_overview' ? 'bg-[#cce5ff] dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-white/[0.04]'}`}
              onClick={() => {
                onSwitchBoard(null);
                onSetMainView("workspace_overview");
              }}
            >
              <LayoutGrid size={15} className={`mr-2 ${!activeBoard && mainView === 'workspace_overview' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
              <span className={`text-[13px] truncate ${!activeBoard && mainView === 'workspace_overview' ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                Workspace Overview
              </span>
            </div>

            <div className="space-y-0.5 px-2 mt-1">
              {visibleBoards.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center justify-between px-3 py-[7px] rounded-md transition-all group/board ${
                    activeBoard?.id === b.id
                      ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium board-item-active"
                      : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <div
                    className="flex items-center space-x-2.5 cursor-pointer flex-1 truncate mr-2"
                    onClick={() => onSwitchBoard(b)}
                  >
                    <Layout
                      size={15}
                      className={
                        activeBoard?.id === b.id
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-400 dark:text-gray-500"
                      }
                    />
                    <span className="truncate text-[13px]">{b.name}</span>
                  </div>
                  <div className="hidden group-hover/board:flex items-center gap-1.5">
                    <Pencil
                      size={13}
                      className="text-gray-400 hover:text-blue-500 cursor-pointer transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRenameBoard(b);
                      }}
                    />
                    {profile?.role === "admin" && (
                      <Trash2
                        size={13}
                        className="text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteBoard(b);
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
