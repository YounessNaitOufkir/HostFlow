"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { LayoutDashboard, Plus, Bell, Pencil, Layout, Trash2, ChevronDown, Briefcase, Lock, Users2, LayoutGrid, CalendarDays, Search } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Board, Workspace, Profile } from "@/types";
import NotificationsMenu from "@/components/NotificationsMenu";
import { useT } from "@/components/LanguageProvider";
import { viewAfterLeaving } from "@/lib/navState";
import { Logo } from "@/components/ui/Logo";
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
  /**
   * The company mark, from organization_settings.logo_url. Rendered only in
   * company workspaces — see the header below.
   */
  companyLogoUrl?: string | null;
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
  onSelectWorkspace: (ws: Workspace | null) => void;
  onRenameWorkspace: (ws: Workspace) => void;
  onDeleteWorkspace: (ws: Workspace) => void;
  onCreateWorkspace: () => void;
  onSignOut: () => void;
  onOpenAdmin: () => void;
  onOpenSearch: () => void;
  onOpenProfileSettings: () => void;
  onNotificationClick: (boardId?: string, itemId?: string, relatedUserId?: string) => void;
  onDuplicateWorkspace?: (ws: Workspace) => void;
  onImportData?: () => void;
}

// Was animated.div: every icon on the rail — sidebar toggle, search, my work,
// trash — was an unreachable div, same defect as the workspace panel below.
// animated.button carries the identical spring, since react-spring's
// `animated` factory works on any host element.
function SpringButton({ children, onClick, className, "aria-label": ariaLabel }: { children: React.ReactNode, onClick?: () => void, className?: string, "aria-label"?: string }) {
  const [props, api] = useSpring(() => ({ scale: 1, config: { tension: 300, friction: 10 } }));
  return (
    <animated.button
      type="button"
      aria-label={ariaLabel}
      style={props}
      onMouseEnter={() => api.start({ scale: 1.12 })}
      onMouseLeave={() => api.start({ scale: 1 })}
      onMouseDown={() => api.start({ scale: 0.95 })}
      onMouseUp={() => api.start({ scale: 1.12 })}
      onClick={onClick}
      className={className}
    >
      {children}
    </animated.button>
  );
}

export default function Sidebar({
  profile,
  workspaces,
  activeWorkspace,
  companyLogoUrl,
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
  onOpenSearch,
  onOpenProfileSettings,
  onNotificationClick,
  onImportData,
}: SidebarProps) {
  const t = useT();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const { anchorRef: wsMenuAnchor, menuRef: wsMenuRef, menuStyle: wsMenuStyle } = useAnchoredMenu(isWorkspaceMenuOpen, { align: 'left' });
  const { anchorRef: createMenuAnchor, menuRef: createMenuRef, menuStyle: createMenuStyle } = useAnchoredMenu(isCreateMenuOpen, { align: 'right' });
  const [membersModalWs, setMembersModalWs] = useState<Workspace | null>(null);

  // A board is only the "current" one while the board view is on screen. Without
  // the mainView check the previous board stays highlighted on Workspace
  // Overview, Master Gantt, My Work and Trash, because page.tsx re-selects a
  // board as soon as activeBoard becomes null.
  const isBoardOpen = (boardId: string) =>
    activeBoard?.id === boardId && mainView === "board";

  // Mirrors can_manage_workspace() in the database. You can see a private
  // workspace you hold a board grant inside, but you cannot rename or delete it
  // — so offering those buttons produced a delete that silently did nothing and
  // looked like it had worked. A global admin role is not enough on its own;
  // private workspaces belong to whoever created them.
  const canManageWorkspace = (ws: Workspace) =>
    ws.created_by === profile?.id ||
    (!ws.is_private && profile?.role === "admin");

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wsMenuAnchor.current && !wsMenuAnchor.current.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
      if (createMenuAnchor.current && !createMenuAnchor.current.contains(event.target as Node)) {
        setIsCreateMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // With no workspace selected the panel used to fall back to every board in
  // every workspace: a flat list with repeated names and nothing to tell them
  // apart, since the workspace each one belongs to was not shown. "All
  // workspaces" is answered by the overview in the middle of the page, which
  // groups the boards under their workspace, so the panel lists none.
  const visibleBoards = activeWorkspace
    ? boards.filter((b) => b.workspace_id === activeWorkspace.id)
    : [];

  return (
    <>
      {/* ======================================= */}
      {/* 1. Icon Rail (left-most 60px sidebar)  */}
      {/* ======================================= */}
      <div className="w-[60px] bg-[#1A2C5B] text-white flex flex-col items-center py-4 justify-between shrink-0 relative z-50">
        <div className="flex flex-col items-center space-y-3 w-full">
          <Tooltip content={t("sidebar.toggle")} side="right">
            <SpringButton
              aria-label={t("sidebar.toggle")}
              className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#F5A623] to-[#E09015] flex items-center justify-center font-bold text-lg select-none cursor-pointer hover:from-[#FFB540] hover:to-[#F5A623] transition-colors shadow-lg shadow-amber-500/30 text-white"
              onClick={onToggleSidebar}
            >
              {/* Bare mark on the amber tile: the tile carries the brand colour,
                  so the bars go white. Same silhouette as the favicon. */}
              <Logo variant="bare" tone="amber" size={20} />
            </SpringButton>
          </Tooltip>
          <div className="w-8 border-t border-white/10 my-1"></div>
          {/* Cmd+K is invisible until you know it exists, and there is no Cmd
              on a phone. The rail carries the same thing where it can be seen. */}
          <Tooltip content={t("search.openPalette")} side="right">
            <SpringButton
              aria-label={t("search.openPalette")}
              onClick={onOpenSearch}
              className="w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer transition-colors text-white/60 hover:text-white hover:bg-white/8"
            >
              <Search size={20} />
            </SpringButton>
          </Tooltip>
          <Tooltip content={t("sidebar.myWork")} side="right">
            <SpringButton
              aria-label={t("sidebar.myWork")}
              onClick={() =>
                onSetMainView(mainView === "my_work" ? viewAfterLeaving(!!activeBoard) : "my_work")
              }
              className={`w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${
                mainView === "my_work"
                  ? "bg-white/15 text-white shadow-inner"
                  : "text-white/60 hover:text-white hover:bg-white/8"
              }`}
            >
              <LayoutDashboard size={20} />
            </SpringButton>
          </Tooltip>
          <Tooltip content={t("sidebar.trashBin")} side="right">
            <SpringButton
              aria-label={t("sidebar.trashBin")}
              // Leaving Trash used to go to "board" unconditionally, stranding the
              // user on "Loading board..." with no board open — the same trap My
              // Work was fixed for. Both now share viewAfterLeaving.
              onClick={() =>
                onSetMainView(mainView === "trash" ? viewAfterLeaving(!!activeBoard) : "trash")
              }
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
          <Tooltip content={t("sidebar.notifications")} side="right">
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
              {/* The clickable row is a nested <button>, not the outer div
                  itself: the dropdown below is a DOM child of this container
                  (per useAnchoredMenu's anchor pattern) and it holds its own
                  buttons, which is invalid HTML nested inside a <button>.
                  anchorRef only needs a position to measure from, so the
                  outer div can stay a plain container. */}
              <div ref={wsMenuAnchor} className="min-h-[52px] border-b border-gray-200 dark:border-slate-700/50 relative">
                <button
                  type="button"
                  className="h-full w-full flex items-center px-4 py-2 font-semibold text-[13px] text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors text-left"
                  onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
                  aria-haspopup="true"
                  aria-expanded={isWorkspaceMenuOpen}
                >
                {/*
                  The company mark stands in for the generic briefcase, but only on a
                  company workspace: a private workspace is personal space and is not
                  Host'lik-branded. Externals never see it for free — they cannot reach
                  a non-private workspace at all (20260820000000), so this branch is
                  unreachable for them. HostFlow's own mark keeps the icon rail.
                */}
                {activeWorkspace?.is_private ? (
                  <Lock size={15} className="mr-2.5 text-brand-amber shrink-0" />
                ) : activeWorkspace && companyLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={companyLogoUrl}
                    alt=""
                    aria-hidden="true"
                    // Height-constrained with automatic width, never a fixed box: a
                    // company mark can be any shape. A wide wordmark (Host'lik's old
                    // one was 3.6:1) and a square avatar tile (the current one is
                    // 500x500) both have to look deliberate here, and object-contain
                    // in a *square* box shrank the wordmark to 5px tall.
                    //
                    // 36px is as tall as this 52px row allows while keeping the mark
                    // clear of the border. rounded-md is for marks like the current
                    // one that carry their own background — without it the tile reads
                    // as a stray dark rectangle against the light header.
                    className="h-9 w-auto max-w-[132px] mr-2.5 shrink-0 rounded-md object-contain object-left"
                  />
                ) : (
                  <Briefcase size={15} className="mr-2.5 text-blue-500 shrink-0" />
                )}
                <span className="min-w-0 flex-1 leading-tight">
                  <TruncatedText className="truncate block">
                    {activeWorkspace ? activeWorkspace.name : t("sidebar.allWorkspacesLower")}
                  </TruncatedText>
                  {/* A private workspace is personal space; anything else is
                      Host'lik's shared company work. Naming which one you're
                      looking at here means you don't have to remember it from
                      whichever board brought you to this workspace. */}
                  {activeWorkspace && (
                    <span className="block truncate text-[10.5px] font-normal uppercase tracking-[0.06em] text-gray-400 dark:text-slate-500 mt-0.5">
                      {activeWorkspace.is_private ? t("sidebar.privateSpace") : t("sidebar.organization")}
                    </span>
                  )}
                </span>
                <ChevronDown
                  size={13}
                  className={`text-gray-400 dark:text-gray-500 transition-transform ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`}
                />
                </button>

                <AnimatePresence>
                  {isWorkspaceMenuOpen && (
                    <motion.div 
                      key="workspace-menu"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      ref={wsMenuRef}
                      style={{ ...wsMenuStyle, width: 260 }}
                      className="dropdown-menu rounded-t-none z-[60] shadow-xl bg-white dark:bg-[#252849] border border-gray-200 dark:border-slate-700/50"
                      onClick={(e) => e.stopPropagation()}
                    >
                    {/* The header reads "All workspaces" when none is selected,
                        but nothing could put you back into that state once you
                        had picked one. This is the way back. Was a div —
                        every row here was unreachable by keyboard. */}
                    <button
                      type="button"
                      className={`w-full text-left px-4 py-2.5 cursor-pointer text-[13px] border-b border-gray-100 dark:border-slate-700/50 transition-colors ${
                        activeWorkspace
                          ? "hover:bg-gray-50 dark:hover:bg-white/[0.04] text-gray-700 dark:text-gray-300"
                          : "bg-[#cce5ff] dark:bg-blue-900/30 font-medium text-blue-700 dark:text-blue-300"
                      }`}
                      onClick={() => {
                        onSelectWorkspace(null);
                        setIsWorkspaceMenuOpen(false);
                      }}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <LayoutGrid size={11} className="shrink-0 opacity-70" />
                        {t("sidebar.allWorkspacesLower")}
                      </span>
                    </button>
                    {workspaces.map((ws) => (
                      <div
                        key={ws.id}
                        className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04] text-[13px] group/ws flex justify-between items-center transition-colors"
                      >
                        <button
                          type="button"
                          className="flex-1 text-left cursor-pointer truncate mr-2 text-gray-700 dark:text-gray-300 py-0.5"
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
                                className="text-brand-amber shrink-0"
                              />
                            )}
                            <TruncatedText className="truncate block">{ws.name}</TruncatedText>
                          </span>
                          <span className={`block truncate text-[10.5px] uppercase tracking-[0.06em] text-gray-400 dark:text-slate-500 mt-0.5 ${ws.is_private ? "ml-[17px]" : ""}`}>
                            {ws.is_private ? t("sidebar.privateSpace") : t("sidebar.organization")}
                          </span>
                        </button>
                        <div className="hidden group-hover/ws:flex items-center gap-2">
                          {/* Icons with role="button" but no tabIndex/onKeyDown were
                              announced as buttons to a screen reader yet unreachable
                              and non-activatable by keyboard — real <button>s instead. */}
                          <button
                            type="button"
                            aria-label={`Manage access to ${ws.name}`}
                            className="text-gray-400 hover:text-blue-500 cursor-pointer transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMembersModalWs(ws);
                              setIsWorkspaceMenuOpen(false);
                            }}
                          >
                            <Users2 size={13} />
                          </button>
                          {canManageWorkspace(ws) && (
                            <>
                              <button
                                type="button"
                                aria-label={`Rename ${ws.name}`}
                                className="text-gray-400 hover:text-blue-500 cursor-pointer transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRenameWorkspace(ws);
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${ws.name}`}
                                className="text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteWorkspace(ws);
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        onCreateWorkspace();
                        setIsWorkspaceMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-white/[0.04] text-[13px] text-blue-600 dark:text-blue-400 flex items-center cursor-pointer transition-colors"
                    >
                      <Plus size={13} className="mr-1.5" /> New Workspace
                    </button>
                  </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Board List */}
              <div className="flex-1 overflow-y-auto py-3">
                {/* Dashboards Section */}
                <div className="px-4 mb-2 mt-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex justify-between items-center">
                  <span>{t("sidebar.dashboards")}</span>
                </div>
                
                <button
                  type="button"
                  className={`group w-full text-left flex items-center px-4 py-2 cursor-pointer transition-colors ${mainView === 'workspace_gantt' ? 'bg-[#cce5ff] dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-white/[0.04]'}`}
                  onClick={() => {
                    onSwitchBoard(null);
                    onSetMainView("workspace_gantt");
                  }}
                >
                  <CalendarDays size={15} className={`mr-2 ${mainView === 'workspace_gantt' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-[13px] truncate ${mainView === 'workspace_gantt' ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    {t("sidebar.masterGantt")}
                  </span>
                </button>

                {/* Boards Section */}
                <div className="px-4 mb-2 mt-5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex justify-between items-center relative">
                  <span>{t("sidebar.boards")}</span>
                  {/* Hidden on "All workspaces": createBoard falls back to
                      whichever workspace the database returns first, so the new
                      board would land somewhere the user never chose. */}
                  <div ref={createMenuAnchor} className={`relative ${activeWorkspace ? "" : "hidden"}`}>
                    <button
                      onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
                      className="hover:bg-gray-100 dark:hover:bg-white/[0.06] p-1 rounded transition-colors text-gray-400 hover:text-blue-500"
                      title={t("sidebar.createBoard")}
                    >
                      <Plus size={14} />
                    </button>
                    
                    <AnimatePresence>
                      {isCreateMenuOpen && (
                        <motion.div 
                          key="create-menu"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          ref={createMenuRef}
                          style={createMenuStyle}
                          className="w-48 dropdown-menu rounded-xl z-[60] shadow-xl bg-white dark:bg-[#252849] border border-gray-200 dark:border-slate-700/50 py-1"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onCreateBoard();
                              setIsCreateMenuOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04] text-[13px] text-gray-700 dark:text-gray-300 flex items-center cursor-pointer transition-colors"
                          >
                            <LayoutGrid size={14} className="mr-2" /> {t("sidebar.blankBoard")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (onImportData) onImportData();
                              setIsCreateMenuOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04] text-[13px] text-gray-700 dark:text-gray-300 flex items-center cursor-pointer transition-colors"
                          >
                            <Briefcase size={14} className="mr-2" /> {t("sidebar.importFromExcel")}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <button
                  type="button"
                  className={`group w-full text-left flex items-center px-4 py-2 cursor-pointer transition-colors ${mainView === 'workspace_overview' ? 'bg-[#cce5ff] dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-white/[0.04]'}`}
                  onClick={() => {
                    onSwitchBoard(null);
                    onSetMainView("workspace_overview");
                  }}
                >
                  <LayoutGrid size={15} className={`mr-2 ${mainView === 'workspace_overview' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-[13px] truncate ${mainView === 'workspace_overview' ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    {t("sidebar.workspaceOverview")}
                  </span>
                </button>

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
                        <button
                          type="button"
                          className="flex items-center space-x-2.5 cursor-pointer flex-1 truncate mr-2 text-left"
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
                        </button>
                        <div className="hidden group-hover/board:flex items-center gap-1.5">
                          {/* These carried onClick directly on the SVG with no
                              role or keyboard support at all — not even the
                              ARIA-only affordance the workspace rows above had. */}
                          <button
                            type="button"
                            aria-label={`Rename ${b.name}`}
                            className="text-gray-400 hover:text-blue-500 cursor-pointer transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRenameBoard(b);
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                          {profile?.role === "admin" && (
                            <button
                              type="button"
                              aria-label={`Delete ${b.name}`}
                              className="text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteBoard(b);
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
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
          profile={profile}
          onClose={() => setMembersModalWs(null)}
        />
      )}
    </>
  );
}
