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
  Lock,
  Users2,
  LayoutGrid,
  CalendarDays,
} from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Board, Workspace, Profile } from "@/types";
import NotificationsMenu from "@/components/NotificationsMenu";
import ProfileMenu from "@/components/ProfileMenu";
import { motion, AnimatePresence } from "framer-motion";
import { useSpring, animated } from "@react-spring/web";
import { TruncatedText } from "@/components/ui/TruncatedText";
import WorkspaceMembersModal from "@/components/WorkspaceMembersModal";

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

function SpringButton({ children, onClick, className }: { children: React.ReactNode, onClick?: () => void, className?: string }) {
  const [props, api] = useSpring(() => ({ scale: 1, config: { tension: 300, friction: 10 } }));
  return (
    <animated.div
      style={props}
      onMouseEnter={() => api.start({ scale: 1.12 })}
      onMouseLeave={() => api.start({ scale: 1 })}
      onMouseDown={() => api.start({ scale: 0.95 })}
      onMouseUp={() => api.start({ scale: 1.12 })}
      onClick={onClick}
      className={className}
    >
      {children}
    </animated.div>
  );
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
  onImportData,
}: SidebarProps) {
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [membersModalWs, setMembersModalWs] = useState<Workspace | null>(null);

  // A board is only the "current" one while the board view is on screen. Without
  // the mainView check the previous board stays highlighted on Workspace
  // Overview, Master Gantt, My Work and Trash, because page.tsx re-selects a
  // board as soon as activeBoard becomes null.
  const isBoardOpen = (boardId: string) =>
    activeBoard?.id === boardId && mainView === "board";
  const workspacePickerRef = useRef<HTMLDivElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (workspacePickerRef.current && !workspacePickerRef.current.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setIsCreateMenuOpen(false);
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
            <SpringButton
              className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#F5A623] to-[#E09015] flex items-center justify-center font-bold text-lg select-none cursor-pointer hover:from-[#FFB540] hover:to-[#F5A623] transition-colors shadow-lg shadow-amber-500/30 text-white"
              onClick={onToggleSidebar}
            >
              H
            </SpringButton>
          </Tooltip>
          <div className="w-8 border-t border-white/10 my-1"></div>
          <Tooltip content="My Work" side="right">
            <SpringButton
              onClick={() => onSetMainView(mainView === "my_work" ? "board" : "my_work")}
              className={`w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${
                mainView === "my_work"
                  ? "bg-white/15 text-white shadow-inner"
                  : "text-white/60 hover:text-white hover:bg-white/8"
              }`}
            >
              <LayoutDashboard size={20} />
            </SpringButton>
          </Tooltip>
          <Tooltip content="Trash Bin" side="right">
            <SpringButton
              onClick={() => onSetMainView(mainView === "trash" ? "board" : "trash")}
              className={`w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${
                mainView === "trash"
                  ? "bg-red-500/20 text-red-400 shadow-inner"
                  : "text-white/60 hover:text-white hover:bg-white/8"
              }`}
            >
              <Trash2 size={20} />
            </SpringButton>
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
      <AnimatePresence initial={false}>
        {showWorkspaceSidebar && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="bg-white/95 dark:bg-[#1e2140]/95 backdrop-blur-xl border-r border-gray-200/80 dark:border-slate-700/50 flex flex-col shrink-0 z-10 overflow-hidden"
          >
            <div className="w-[260px] h-full flex flex-col">
              {/* Workspace Picker */}
              <div 
                ref={workspacePickerRef}
                className="h-[52px] border-b border-gray-200 dark:border-slate-700/50 flex items-center px-4 font-semibold text-[13px] text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors relative"
                onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
              >
                {activeWorkspace?.is_private ? (
                  <Lock size={15} className="mr-2.5 text-amber-500 shrink-0" />
                ) : (
                  <Briefcase size={15} className="mr-2.5 text-blue-500 shrink-0" />
                )}
                <TruncatedText className="truncate flex-1">
                  {activeWorkspace ? activeWorkspace.name : "All workspaces"}
                </TruncatedText>
                <ChevronDown
                  size={13}
                  className={`text-gray-400 dark:text-gray-500 transition-transform ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`}
                />

                <AnimatePresence>
                  {isWorkspaceMenuOpen && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
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
                          <span className="flex items-center gap-1.5 min-w-0">
                            {ws.is_private && (
                              <Lock
                                size={11}
                                className="text-amber-500 shrink-0"
                              />
                            )}
                            <TruncatedText className="truncate block">{ws.name}</TruncatedText>
                          </span>
                        </div>
                        <div className="hidden group-hover/ws:flex items-center gap-2">
                          <Users2
                            size={13}
                            role="button"
                            aria-label={`Manage access to ${ws.name}`}
                            className="text-gray-400 hover:text-blue-500 cursor-pointer transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMembersModalWs(ws);
                              setIsWorkspaceMenuOpen(false);
                            }}
                          />
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
                  </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Board List */}
              <div className="flex-1 overflow-y-auto py-3">
                {/* Dashboards Section */}
                <div className="px-4 mb-2 mt-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex justify-between items-center">
                  <span>Dashboards</span>
                </div>
                
                <div 
                  className={`group flex items-center px-4 py-2 cursor-pointer transition-colors ${mainView === 'workspace_gantt' ? 'bg-[#cce5ff] dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-white/[0.04]'}`}
                  onClick={() => {
                    onSwitchBoard(null);
                    onSetMainView("workspace_gantt");
                  }}
                >
                  <CalendarDays size={15} className={`mr-2 ${mainView === 'workspace_gantt' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-[13px] truncate ${mainView === 'workspace_gantt' ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    Master Gantt Chart
                  </span>
                </div>

                {/* Boards Section */}
                <div className="px-4 mb-2 mt-5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex justify-between items-center relative">
                  <span>Boards</span>
                  <div ref={createMenuRef} className="relative">
                    <button
                      onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
                      className="hover:bg-gray-100 dark:hover:bg-white/[0.06] p-1 rounded transition-colors text-gray-400 hover:text-blue-500"
                      title="Create Board"
                    >
                      <Plus size={14} />
                    </button>
                    
                    <AnimatePresence>
                      {isCreateMenuOpen && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="absolute top-full right-0 mt-1 w-48 dropdown-menu rounded-xl z-50 shadow-xl bg-white dark:bg-[#252849] border border-gray-200 dark:border-slate-700/50 py-1"
                        >
                          <div
                            onClick={() => {
                              onCreateBoard();
                              setIsCreateMenuOpen(false);
                            }}
                            className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04] text-[13px] text-gray-700 dark:text-gray-300 flex items-center cursor-pointer transition-colors"
                          >
                            <LayoutGrid size={14} className="mr-2" /> Blank Board
                          </div>
                          <div
                            onClick={() => {
                              if (onImportData) onImportData();
                              setIsCreateMenuOpen(false);
                            }}
                            className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04] text-[13px] text-gray-700 dark:text-gray-300 flex items-center cursor-pointer transition-colors"
                          >
                            <Briefcase size={14} className="mr-2" /> Import from Excel
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div 
                  className={`group flex items-center px-4 py-2 cursor-pointer transition-colors ${mainView === 'workspace_overview' ? 'bg-[#cce5ff] dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-white/[0.04]'}`}
                  onClick={() => {
                    onSwitchBoard(null);
                    onSetMainView("workspace_overview");
                  }}
                >
                  <LayoutGrid size={15} className={`mr-2 ${mainView === 'workspace_overview' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-[13px] truncate ${mainView === 'workspace_overview' ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    Workspace Overview
                  </span>
                </div>

                <div className="space-y-0.5 px-2 mt-1">
                  <AnimatePresence initial={false}>
                    {visibleBoards.map((b, idx) => (
                      <motion.div
                        key={b.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.2 } }}
                        transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.4) }}
                        className={`flex items-center justify-between px-3 py-[7px] rounded-md transition-colors group/board ${
                          isBoardOpen(b.id)
                            ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium board-item-active"
                            : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        <div
                          className="flex items-center space-x-2.5 cursor-pointer flex-1 truncate mr-2"
                          onClick={() => {
                            if (activeBoard?.id === b.id) {
                              onSetMainView("board");
                            } else {
                              onSwitchBoard(b);
                            }
                          }}
                        >
                          <Layout
                            size={15}
                            className={
                              isBoardOpen(b.id)
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-gray-400 dark:text-gray-500"
                            }
                          />
                          <TruncatedText className="truncate text-[13px]">{b.name}</TruncatedText>
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
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {membersModalWs && profile && (
        <WorkspaceMembersModal
          workspace={membersModalWs}
          currentUserId={profile.id}
          onClose={() => setMembersModalWs(null)}
        />
      )}
    </>
  );
}
