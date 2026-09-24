"use client";

// ============================================================
// HostFlow — main application page (orchestrator)
// ============================================================
//
// This file is now a thin orchestrator (~250 lines) that composes:
// - useBoardStore (state management)
// - useRealtimeSync (realtime subscriptions)
// - useFilters (filter/sort logic)
// - Layout components (Sidebar, BoardHeader)
// - View components (BoardTableView, KanbanView, etc.)
//
// Previously: 1,368 lines with ~30 useState calls and all logic inline.
// ============================================================

import React, { useEffect, useCallback, useState, useRef } from "react";
import { DropResult } from "@hello-pangea/dnd";
import { AnimatePresence, motion } from "framer-motion";

// Hooks
import { useBoardStore } from "@/hooks/useBoardStore";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useFilters } from "@/hooks/useFilters";
import { useAuth } from "@/components/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import {
  useGlobalSettingsQuery,
  useWorkspacesQuery,
  useProfilesQuery,
  useBoardsQuery,
  useMyWorkQuery,
} from "@/hooks/queries/useGlobalQueries";
import { useBoardDataQuery } from "@/hooks/queries/useBoardDataQuery";
import { supabase } from "@/lib/supabase";
import { readNavState, writeNavState, clearLegacyNavKeys, isBoardIndependentView } from "@/lib/navState";
import { readDeepLink, clearDeepLink } from "@/lib/deepLink";
import { useLocaleSync } from "@/hooks/useLocaleSync";
import type { Board, Workspace } from "@/types";

import { duplicateBoard, duplicateWorkspace } from "@/lib/templateUtils";
import { executeImport } from "@/lib/importUtils";
import ImportModal, { ImportConfig } from "@/components/ImportModal";
import { AssignablePeopleContext } from "@/components/AssignablePeopleContext";
import { BoardAccessContext, type BoardAccessValue } from "@/components/BoardAccessContext";
import { useBoardAccessQuery } from "@/hooks/queries/useBoardAccessQuery";
import { hasBoardAccess, canGrantBoardAccess } from "@/lib/boardAccess";
import { reportMutationError } from "@/lib/errorReporting";
import { toast } from "sonner";

// Layout components
import Sidebar from "@/components/layout/Sidebar";
import BoardHeader from "@/components/layout/BoardHeader";
import SampleRowsBanner from "@/components/board/SampleRowsBanner";

// View components
import BoardTableView from "@/components/views/BoardTableView";
import KanbanView from "@/components/KanbanView";
import DashboardView from "@/components/DashboardView";
import CalendarView from "@/components/CalendarView";
import GanttView from "@/components/GanttView";
import MyWorkView from "@/components/MyWorkView";
import SearchView from "@/components/views/SearchView";
import SearchPalette from "@/components/search/SearchPalette";
import TrashView from "@/components/views/TrashView";
import BoardCardsView from "@/components/views/BoardCardsView";
import ActivityLog from "@/components/views/ActivityLog";
import WorkspaceOverview from "@/components/WorkspaceOverview";
import WorkspaceGanttView, { type WorkspaceGanttUpdate } from "@/components/WorkspaceGanttView";

// Feature components
import ItemPanel from "@/components/ItemPanel";
import AutomationsModal from "@/components/AutomationsModal";
import { BoardSkeleton } from "@/components/skeletons/BoardSkeleton";
import { SidebarSkeleton } from "@/components/skeletons/SidebarSkeleton";

import EmptyState from "@/components/EmptyState";
import LandingPage from "@/components/landing/LandingPage";
import ProfileSettingsModal from "@/components/ProfileSettingsModal";
import AdminSettingsModal from "@/components/AdminSettingsModal";
import ReadabilityModal from "@/components/ReadabilityModal";
import TaskCreateModal from "@/components/TaskCreateModal";

import type { ColumnType } from "@/types";
import { useAppHistory, type AppLocation } from "@/hooks/useAppHistory";

// Views that show a single board; the rest (My Work, Trash, Overview, Search,
// the Master Gantt) are not "on the board".
const BOARD_VIEWS = new Set<string>(["board", "kanban", "dashboard", "calendar", "gantt", "cards", "activity"]);

export default function HostFlowApp() {
  const { user, profile, loading: authLoading, signOut, refreshProfile } = useAuth();

  // Mirrors the language chosen in this browser onto the profile, so the cron
  // that sends automation emails can write to people in their own language.
  useLocaleSync(profile);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showAdminSettingsModal, setShowAdminSettingsModal] = useState(false);
  // Where the admin panel should open to when it was reached by clicking a
  // notification about a specific person (a new signup, an access request),
  // rather than through the sidebar's plain "Admin Settings" entry.
  const [adminModalTarget, setAdminModalTarget] = useState<{
    tab: "organization" | "users" | "permissions";
    profileId: string;
  } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Handed to the view when the palette gives up on a query, so the words
  // are not typed twice.
  const [searchSeed, setSearchSeed] = useState("");
  const [showReadabilityModal, setShowReadabilityModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const store = useBoardStore(() => setShowImportModal(true));
  const { state, dispatch } = store;
  const queryClient = useQueryClient();

  const boardHiddenColumns = state.activeBoard ? (state.hiddenColumns[state.activeBoard.id] || []) : [];
  // ?? [] because boards.columns is nullable in Postgres even though the type
  // says otherwise; without it a single null row throws out of the whole render.
  const allColumns = state.activeBoard?.columns ?? [];
  const visibleColumns = allColumns.filter(c => !boardHiddenColumns.includes(c.id));

  const activeColumns = state.activeBoard?.columns || [];

  // Filter hook
  const filters = useFilters(state.items, activeColumns);

  // Refresh handler (e.g. after duplicating a board)
  const refreshData = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.boards() })
    ]);
    setIsRefreshing(false);
  };

  const handleDuplicateBoard = async () => {
    if (!state.activeBoard) return;
    setIsDuplicating(true);
    try {
      const targetWorkspaceId = state.activeWorkspace?.id || state.activeBoard.workspace_id || "";
      const newBoard = await duplicateBoard(state.activeBoard.id, targetWorkspaceId);
      await refreshData();
      if (newBoard) {
        dispatch({ type: "SET_ACTIVE_BOARD", payload: newBoard });
      }
    } catch (err: any) {
      reportMutationError(err, "Failed to duplicate board");
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDuplicateWorkspace = async (ws: any) => {
    setIsDuplicating(true);
    try {
      const newWs = await duplicateWorkspace(ws.id);
      await refreshData();
      if (newWs) {
        dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: newWs });
      }
    } catch (err) {
      reportMutationError(err, "Failed to duplicate workspace");
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleImport = async (config: ImportConfig) => {
    if (!state.activeWorkspace && !state.activeBoard) {
      toast.warning("Please select a workspace first.");
      return;
    }
    
    const wsId = state.activeWorkspace?.id || (state.activeBoard ? state.activeBoard.workspace_id : null);
    if (!wsId) throw new Error("No workspace selected.");

    const targetBoardId = await executeImport(config, wsId, state.activeBoard?.id, allColumns);
    await refreshData();
    
    if (config.target === "new_board" && targetBoardId) {
      let newBoard: Board | null = state.boards.find(b => b.id === targetBoardId) || null;
      if (!newBoard) {
        const { data: fetchedBoard } = await supabase.from("boards").select("*").eq("id", targetBoardId).single();
        if (fetchedBoard) {
          const board: Board = fetchedBoard;
          newBoard = board;
          dispatch({ type: "SET_BOARDS", payload: [...state.boards, board] });
        }
      }
      
      if (newBoard) {
        store.switchBoard(newBoard);
        dispatch({ type: "SET_MAIN_VIEW", payload: "board" });
      } else if (profile?.id) {
        // Reload as a last resort, but record the new board the same way the
        // restore path reads it. Writing the old monday_clone_active_board_id
        // key here would be ignored now and drop the user on My Work instead of
        // the board they just imported.
        writeNavState({
          userId: profile.id,
          mainView: "board",
          boardId: targetBoardId,
          workspaceId: wsId,
        });
        window.location.reload();
      }
    }
  };

  // ============================================================
  // React Query Data Fetching & Store Sync
  // ============================================================
  const { data: settingsData } = useGlobalSettingsQuery(!authLoading && !!user);
  useEffect(() => {
    if (settingsData) {
      if (settingsData.organizationSettings) {
        dispatch({ type: "SET_ORGANIZATION_SETTINGS", payload: settingsData.organizationSettings });
      }
      dispatch({ type: "SET_TEAMS", payload: settingsData.teams });
    }
  }, [settingsData, dispatch]);

  const { data: workspacesData, isLoading: workspacesLoading } = useWorkspacesQuery(!authLoading && !!user);
  useEffect(() => {
    if (workspacesData) {
      // Only restore a workspace that is still in the list this user can see.
      // Access can be revoked, and a workspace can be switched to private, so a
      // remembered id is not proof it is still reachable.
      const saved = readNavState(profile?.id);
      const savedWs = saved?.workspaceId
        ? workspacesData.find((ws) => ws.id === saved.workspaceId) || null
        : null;
      dispatch({
        type: "SET_WORKSPACES",
        payload: { workspaces: workspacesData, active: savedWs },
      });
    }
  }, [workspacesData, dispatch, profile?.id]);

  const { data: profilesData } = useProfilesQuery(!authLoading && !!user);
  useEffect(() => {
    if (profilesData) {
      dispatch({ type: "SET_PROFILES", payload: profilesData });
    }
  }, [profilesData, dispatch]);

  const { data: boardsData, isLoading: boardsLoading } = useBoardsQuery(!authLoading && !!user);

  // Which user we have already restored the saved location for.
  //
  // Restoring is a once-per-sign-in event, but this effect also has to re-run
  // whenever the board list changes. Without this guard it treated "no active
  // board" as "just signed in" and restored the saved location again — so
  // every deliberate move AWAY from a board (picking another workspace, or
  // opening Workspace Overview or the Master Gantt, all of which clear the
  // active board) was immediately undone and the old board came back.
  const restoredForUser = useRef<string | null>(null);

  useEffect(() => {
    if (boardsData && boardsData.length > 0) {
      dispatch({ type: "SET_BOARDS", payload: boardsData });
      const isFirstLoadForThisUser =
        !!profile?.id && restoredForUser.current !== profile.id;
      if (isFirstLoadForThisUser && !state.activeBoard) {
        restoredForUser.current = profile!.id;

        // A link followed in from outside — today, an automation email — beats
        // wherever this user happened to be last. They clicked it to reach one
        // specific task, not to resume a session.
        const deepLink = readDeepLink();
        const linkedBoard = deepLink
          ? boardsData.find((b) => b.id === deepLink.boardId) || null
          : null;
        // Taken out of the address bar as soon as it has been read, whether or
        // not the board turned out to be visible to this user: leaving it there
        // would drag them back to the same task on every later reload.
        if (deepLink) clearDeepLink();

        const saved = readNavState(profile?.id);
        const savedBoard = saved?.boardId
          ? boardsData.find((b) => b.id === saved.boardId) || null
          : null;

        if (linkedBoard) {
          dispatch({ type: "SET_ACTIVE_BOARD", payload: linkedBoard });
          dispatch({ type: "SET_MAIN_VIEW", payload: "board" as any });
          if (deepLink!.itemId) {
            // The board's items have not been fetched yet. The effect watching
            // pendingSelectedItemId opens the panel once they arrive — the same
            // path notifications and My Work use to cross boards.
            dispatch({
              type: "SET_PENDING_SELECTED_ITEM",
              payload: deepLink!.itemId,
            });
          }
        } else if (savedBoard) {
          // Carry on where they left off, including which view they were using.
          dispatch({ type: "SET_ACTIVE_BOARD", payload: savedBoard });
          if (saved?.mainView) {
            dispatch({ type: "SET_MAIN_VIEW", payload: saved.mainView as any });
          }
        } else {
          // Nothing valid to restore. Do NOT fall back to whichever board sorts
          // first: on a multi-property account that is a confident wrong answer,
          // and it silently reopens a property the user was not working on.
          //
          // Land on My Work, which answers "what is mine today" across every
          // workspace. Someone with no boards at all is new or external and has
          // nothing assigned, so send them to the overview to orient instead.
          //
          // Board count is used rather than a real assigned-items check because
          // useMyWorkQuery reads every item in the account; running that on each
          // load to pick a landing page is not worth the cost. My Work's own
          // empty state covers the case where a user has boards but no tasks.
          dispatch({ type: "SET_ACTIVE_BOARD", payload: null });
          dispatch({
            type: "SET_MAIN_VIEW",
            // Only a view that works WITHOUT a board may be restored here.
            // The old check let anything through except the literal "board", so
            // a user last seen in Kanban/Gantt/Calendar/Dashboard/Cards was
            // restored into that view with no board behind it and got a
            // permanent "Loading board..." spinner. It also re-persisted that
            // pairing, so every later reload landed on the spinner again.
            payload: (isBoardIndependentView(saved?.mainView)
              ? saved!.mainView
              : boardsData.length > 0
                ? "my_work"
                : "workspace_overview") as any,
          });
        }
      } else if (state.activeBoard) {
        // Not a restore — just keep the open board's object in sync with the
        // refreshed list.
        const updated = boardsData.find((b) => b.id === state.activeBoard?.id);
        if (updated) dispatch({ type: "SET_ACTIVE_BOARD", payload: updated });
      }
      dispatch({ type: "SET_LOADING", payload: false });
    } else if (boardsData && boardsData.length === 0 && !boardsLoading) {
      dispatch({ type: "SET_BOARDS", payload: [] });
      dispatch({ type: "SET_ACTIVE_BOARD", payload: null });
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [boardsData, boardsLoading, state.activeBoard?.id, state.activeWorkspace?.id, dispatch, profile?.id]);

  /**
   * Picking a workspace always means "show me this workspace" — it lands on
   * that workspace's overview and closes whatever board was open.
   *
   * Previously it set the workspace and nothing else, so the board from the
   * workspace you just left stayed on screen until you happened to click a
   * board in the new one.
   *
   * This is deliberately unconditional, including when the open board belongs
   * to the workspace being picked. The sidebar clears the active board on this
   * click regardless, so a "keep the board" exception would leave a cleared
   * board with mainView still "board" — which renders the endless
   * "Loading board..." state rather than the board it meant to keep.
   *
   * Passing null is the "All workspaces" case and lands on the same overview
   * showing every workspace.
   */
  const selectWorkspace = useCallback(
    (ws: Workspace | null) => {
      dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: ws });
      dispatch({ type: "SET_ACTIVE_BOARD", payload: null });
      dispatch({ type: "SET_MAIN_VIEW", payload: "workspace_overview" });
    },
    [dispatch]
  );

  // Keep the selected workspace in step with the board that is open.
  //
  // Opening a board does not go through the workspace picker — My Work, a
  // notification, and the board cards on the all-workspaces overview all jump
  // straight to a board. That used to leave activeWorkspace pointing at the
  // wrong workspace, or at none, which now matters: the panel lists the
  // selected workspace's boards, so a board could be open with an empty panel
  // around it and no way to see its siblings.
  useEffect(() => {
    const board = state.activeBoard;
    if (!board) return;
    if (state.activeWorkspace?.id === board.workspace_id) return;
    const owner = state.workspaces.find((w) => w.id === board.workspace_id);
    if (owner) dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: owner });
  }, [
    state.activeBoard,
    state.activeWorkspace?.id,
    state.workspaces,
    dispatch,
  ]);

  // Browser Back/Forward inside the app. Going back closes any open task panel
  // and puts the board, workspace and view back as they were.
  const applyHistoryLocation = useCallback(
    (loc: AppLocation) => {
      const board = loc.boardId ? state.boards.find((b) => b.id === loc.boardId) ?? null : null;
      const workspace = board
        ? state.workspaces.find((w) => w.id === board.workspace_id) ?? null
        : loc.workspaceId
          ? state.workspaces.find((w) => w.id === loc.workspaceId) ?? null
          : null;
      dispatch({ type: "SET_SELECTED_ITEM", payload: null });
      dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: workspace });
      if (board) {
        if (state.activeBoard?.id !== board.id) store.switchBoard(board);
      } else {
        dispatch({ type: "SET_ACTIVE_BOARD", payload: null });
      }
      // A board view with no board behind it (deleted, or access lost since)
      // falls back to the overview rather than an empty "Loading board...".
      const view = board || !BOARD_VIEWS.has(loc.mainView) ? loc.mainView : "workspace_overview";
      dispatch({ type: "SET_MAIN_VIEW", payload: view as typeof state.mainView });
    },
    [state.boards, state.workspaces, state.activeBoard?.id, store.switchBoard, dispatch]
  );

  const appHistory = useAppHistory({
    ready: !authLoading && !!user && !state.loading,
    location: {
      boardId: state.activeBoard?.id ?? null,
      workspaceId: state.activeWorkspace?.id ?? null,
      mainView: state.mainView,
    },
    apply: applyHistoryLocation,
  });

  // Remember where this user is, so the next sign-in continues rather than
  // restarting. Keyed by user id, so one account never inherits another's
  // location on a shared browser.
  useEffect(() => {
    if (authLoading || !profile?.id || state.loading) return;
    writeNavState({
      userId: profile.id,
      mainView: state.mainView,
      boardId: state.activeBoard?.id ?? null,
      // Fall back to the board's own workspace: arriving from My Work or a
      // notification switches the board without ever setting activeWorkspace,
      // and saving null there would restore the board with no workspace around
      // it.
      workspaceId: state.activeWorkspace?.id ?? state.activeBoard?.workspace_id ?? null,
    });
  }, [
    authLoading,
    profile?.id,
    state.loading,
    state.mainView,
    state.activeBoard?.id,
    state.activeWorkspace?.id,
  ]);

  // One-time cleanup of the per-browser keys this replaced
  useEffect(() => {
    clearLegacyNavKeys();
  }, []);

  const { data: boardData, isLoading: isBoardDataLoading } = useBoardDataQuery(state.activeBoard?.id || null);
  useEffect(() => {
    if (boardData && state.activeBoard) {
      dispatch({
        type: "SET_BOARD_DATA",
        payload: {
          groups: boardData.groups,
          items: boardData.items,
          automations: boardData.automations,
          itemLinks: boardData.itemLinks,
        },
      });
      dispatch({ type: "SET_TRASH_ITEMS", payload: boardData.trashItems });
    }
  }, [boardData, state.activeBoard?.id, dispatch]);

  const { data: myWorkData } = useMyWorkQuery(profile, state.boards, state.mainView === "my_work");
  useEffect(() => {
    if (myWorkData && state.mainView === "my_work") {
      dispatch({ type: "SET_MY_WORK_ITEMS", payload: myWorkData });
    }
  }, [myWorkData, state.mainView, dispatch]);

  // ============================================================
  // Realtime Subscriptions (via Query Invalidation)
  // ============================================================
  const handleBoardDataChanged = useCallback(
    (boardId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boardData(boardId) });
    },
    [queryClient]
  );

  const handleBoardsChanged = useCallback(
    () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boards() });
    },
    [queryClient]
  );

  const handleWorkspacesChanged = useCallback(
    () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
    },
    [queryClient]
  );

  const handleGlobalSettingsChanged = useCallback(
    () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.globalSettings() });
    },
    [queryClient]
  );

  const handleAuditLogChanged = useCallback(
    (boardId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(boardId) });
    },
    [queryClient]
  );

  useRealtimeSync({
    activeBoard: state.activeBoard,
    onBoardDataChanged: handleBoardDataChanged,
    onBoardsChanged: handleBoardsChanged,
    onWorkspacesChanged: handleWorkspacesChanged,
    onGlobalSettingsChanged: handleGlobalSettingsChanged,
    onAuditLogChanged: handleAuditLogChanged,
  });

  // ============================================================
  // Memoized Callbacks for child components
  // ============================================================
  const handleUpdateCell = useCallback(
    (itemId: string, columnId: string, value: any) => {
      if (profile && state.activeBoard) {
        store.updateCell(state.items, state.itemLinks, state.activeBoard, state.boardAutomations, profile, itemId, columnId, value);
      }
    },
    [state.items, state.itemLinks, state.activeBoard, state.boardAutomations, profile, store.updateCell]
  );

  /**
   * A Gantt drag: the task that moved plus everything it pushed, written as one
   * undoable change. The chart has already resolved the whole reschedule, so
   * this deliberately does not run the dependency cascade a single-cell edit
   * would — that would shift the same successors a second time.
   */
  const handleGanttReschedule = useCallback(
    (
      changes: { itemId: string; columnId: string; value: any }[],
      summary: { movedCount: number; cycleDetected: boolean }
    ) => {
      if (summary.cycleDetected) {
        toast.warning("These tasks depend on each other in a loop, so the plan could not be fully rescheduled.");
      }
      store.updateCells(state.items, changes, {
        message:
          summary.movedCount > 0
            ? `Moved ${summary.movedCount} dependent task${summary.movedCount === 1 ? "" : "s"}`
            : undefined,
      });
    },
    [state.items, store.updateCells]
  );

  /**
   * A drag on the Master Gantt. There is no active board there, so the view
   * hands over the board the item belongs to and that board's rules, letting
   * the edit run through the same path a drag on the board's own Gantt takes.
   */
  const handleWorkspaceGanttUpdate = useCallback(
    ({ board, automations, items, itemLinks, itemId, columnId, value }: WorkspaceGanttUpdate) => {
      if (!profile) return;
      store.updateCell(items, itemLinks, board, automations, profile, itemId, columnId, value);
    },
    [profile, store.updateCell]
  );

  const handleAddColumn = useCallback(
    (type: ColumnType) => {
      if (state.activeBoard) store.addColumn(state.activeBoard, type);
    },
    [state.activeBoard, store.addColumn]
  );

  const handleRenameColumn = useCallback(
    (columnId: string, title: string) => {
      if (state.activeBoard) store.renameColumn(state.activeBoard, columnId, title);
    },
    [state.activeBoard, store.renameColumn]
  );

  const handleDeleteColumn = useCallback(
    (columnId: string) => {
      if (state.activeBoard) store.deleteColumn(state.activeBoard, columnId);
    },
    [state.activeBoard, store.deleteColumn]
  );

  const handleAddItem = useCallback(
    (groupId: string, name: string) => {
      if (state.activeBoard) store.addItem(groupId, name, state.activeBoard, state.items);
    },
    [state.activeBoard, state.items, store.addItem]
  );

  const handleAddGroup = useCallback(() => {
    if (state.activeBoard) store.addGroup(state.activeBoard, state.groups);
  }, [state.activeBoard, state.groups, store.addGroup]);

  const handleDragEnd = useCallback(
    (result: DropResult) => store.handleDragEnd(result),
    [store.handleDragEnd]
  );

  const handleGanttMoveItem = useCallback((sourceId: string, targetId: string) => {
    const sourceItem = state.items.find(i => i.id === sourceId);
    const targetItem = state.items.find(i => i.id === targetId);
    if (!sourceItem || !targetItem) return;

    const sourceGroupItems = state.items.filter(i => i.group_id === sourceItem.group_id).sort((a, b) => a.position - b.position);
    const targetGroupItems = state.items.filter(i => i.group_id === targetItem.group_id).sort((a, b) => a.position - b.position);

    const sourceIndex = sourceGroupItems.findIndex(i => i.id === sourceId);
    const targetIndex = targetGroupItems.findIndex(i => i.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const result = {
      source: { droppableId: sourceItem.group_id, index: sourceIndex },
      destination: { droppableId: targetItem.group_id, index: targetIndex },
      draggableId: sourceId,
      type: 'DEFAULT',
      reason: 'DROP',
      mode: 'FLUID'
    } as DropResult;
    store.handleDragEnd(result);
  }, [state.items, store.handleDragEnd]);

  const handleSetEditingGroup = useCallback(
    (id: string | null, title: string) => dispatch({ type: "SET_EDITING_GROUP", payload: { id, title } }),
    [dispatch]
  );

  /**
   * Take the user to where an item actually lives: switch to its board, then
   * open it. When the board is not loaded yet the id is parked in
   * pendingSelectedItemId and the effect below opens the panel once its items
   * arrive.
   *
   * Used by notifications and by My Work, so clicking a task there lands on it
   * in context instead of hunting for which board it belongs to.
   */
  // Cmd/Ctrl+K from anywhere. Bound on the window rather than on a component
  // so it works whatever has focus, and it deliberately does not fire while
  // the caret is in a field - / and K are letters people type.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The task a notification or My Work just sent us to; once its panel is
  // open, the effect below scrolls its row into view and flashes it.
  const revealItemIdRef = useRef<string | null>(null);

  const navigateToItem = useCallback((boardId?: string, itemId?: string) => {
    revealItemIdRef.current = itemId ?? null;
    if (boardId) {
      if (state.activeBoard?.id !== boardId) {
        const board = state.boards.find(b => b.id === boardId);
        if (board) {
          store.switchBoard(board);
          if (itemId) {
            dispatch({ type: "SET_PENDING_SELECTED_ITEM", payload: itemId });
          }
        }
      } else if (itemId) {
        // Already the open board, but maybe not on screen: from Overview, My
        // Work, Trash or Search this used to open the task's panel over that
        // page and never show the board it lives on.
        if (!BOARD_VIEWS.has(state.mainView)) {
          dispatch({ type: "SET_MAIN_VIEW", payload: "board" });
        }
        const itemToSelect = state.items.find(i => i.id === itemId);
        if (itemToSelect) {
          dispatch({ type: "SET_SELECTED_ITEM", payload: itemToSelect });
        } else {
          dispatch({ type: "SET_PENDING_SELECTED_ITEM", payload: itemId });
        }
      }
    }
  }, [state.activeBoard, state.boards, state.items, state.mainView, store.switchBoard, dispatch]);

  // Rows render a moment after the panel opens (the board's items may still be
  // loading), so look for the row over a few frames rather than once. A row in
  // a collapsed group, or in a view with no rows (Kanban, Calendar...), simply
  // isn't found; the open panel is still where the task is.
  useEffect(() => {
    const target = revealItemIdRef.current;
    if (!target || state.selectedItem?.id !== target) return;
    revealItemIdRef.current = null;
    let frame = 0;
    let raf = 0;
    const find = () => {
      const row = document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(target)}"]`);
      if (row) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        row.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        row.classList.add("row-flash");
        window.setTimeout(() => row.classList.remove("row-flash"), 2200);
      } else if (++frame < 90) {
        raf = requestAnimationFrame(find);
      }
    };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [state.selectedItem]);

  // A notification about a person rather than a board/item (a new signup, an
  // access request) has nowhere on the board to navigate to - it routes to the
  // one place that can act on it instead: the admin panel, on the person who
  // needs something already selected.
  const handleNotificationClick = useCallback(
    (boardId?: string, itemId?: string, relatedUserId?: string, messageKey?: string) => {
      if (boardId || itemId) {
        navigateToItem(boardId, itemId);
        return;
      }
      if (relatedUserId) {
        // An access request is someone asking to be let in, so it opens User
        // Roles, where Team vs External is decided. A plain signup keeps
        // opening Data Access, as before.
        const tab = messageKey === "notif.workspaceAccessRequest" ? "users" : "permissions";
        setAdminModalTarget({ tab, profileId: relatedUserId });
        setShowAdminSettingsModal(true);
      }
    },
    [navigateToItem]
  );

  useEffect(() => {
    if (state.pendingSelectedItemId && state.items.length > 0) {
      const itemToSelect = state.items.find(i => i.id === state.pendingSelectedItemId);
      if (itemToSelect) {
        dispatch({ type: "SET_SELECTED_ITEM", payload: itemToSelect });
      }
    }
  }, [state.pendingSelectedItemId, state.items, dispatch]);

  useEffect(() => {
    const handleOpenReadability = () => setShowReadabilityModal(true);
    window.addEventListener("open-readability", handleOpenReadability);
    return () => window.removeEventListener("open-readability", handleOpenReadability);
  }, []);

  const handleRenameGroup = useCallback(
    (groupId: string, title: string) => store.renameGroup(groupId, title),
    [store.renameGroup]
  );

  // ============================================================
  // Render Guards
  // ============================================================
  // Who may be assigned work here. A shared workspace is staff-only, so an
  // external person offered in the picker would be handed a task on a board
  // they cannot open. On a private workspace there is no such restriction:
  // an external can be invited there, so anyone listed is fair game.
  const assignablePeopleIds = React.useMemo(() => {
    if (!state.activeWorkspace || state.activeWorkspace.is_private) return null;
    return new Set(
      state.profiles.filter((p) => p.is_staff !== false).map((p) => p.id)
    );
  }, [state.activeWorkspace, state.profiles]);

  // Whether a candidate assignee can actually reach the board being edited —
  // looked up against the board's OWN workspace, not whichever workspace the
  // sidebar happens to have selected (those can differ, e.g. after a search
  // navigation), unlike assignablePeopleIds above. hasAccess/canGrant/grant
  // drive PeopleCell's guard on shared workspaces; workspaceMemberRoles
  // widens the picker on private ones to everyone actually invited there.
  const activeBoardWorkspace = React.useMemo(
    () => state.workspaces.find((w) => w.id === state.activeBoard?.workspace_id),
    [state.workspaces, state.activeBoard?.workspace_id]
  );
  const { data: boardAccessData } = useBoardAccessQuery(
    state.activeBoard?.id ?? null,
    activeBoardWorkspace?.id
  );
  const boardAccessValue: BoardAccessValue | null = React.useMemo(() => {
    if (!state.activeBoard || !profile) return null;
    const board = state.activeBoard;
    const boardMemberIds = boardAccessData?.boardMemberIds ?? new Set<string>();
    const workspaceMemberRoles = boardAccessData?.workspaceMemberRoles ?? new Map<string, string>();
    return {
      hasAccess: (userId: string) => {
        const candidate = state.profiles.find((p) => p.id === userId);
        if (!candidate) return false;
        return hasBoardAccess(candidate, board, activeBoardWorkspace, boardMemberIds, workspaceMemberRoles);
      },
      canGrant: canGrantBoardAccess(
        profile.id,
        profile,
        board,
        activeBoardWorkspace,
        workspaceMemberRoles.get(profile.id)
      ),
      grant: (userId: string) => store.grantBoardAccess(board, userId),
      workspaceMemberRoles,
    };
  }, [state.activeBoard, activeBoardWorkspace, state.profiles, boardAccessData, profile, store.grantBoardAccess]);

  if (!state.mounted) return null;

  // Checked before the loading skeleton below, not after: state.loading only
  // ever clears once useBoardsQuery resolves, and that query is disabled for a
  // signed-out visitor (see its `enabled` argument above) so it would never
  // resolve — trapping them on the skeleton forever instead of ever reaching
  // the landing page.
  if (!authLoading && !user) {
    // An expired/invalid confirmation or magic link lands here, not on
    // /auth/callback — signUp()'s emailRedirectTo points at "/" (see
    // app/login/page.tsx), and Supabase reports that failure by redirecting
    // to it with `error`/`error_code` in the query string AND the hash
    // fragment rather than exchanging a session. Silently falling through to
    // the marketing page threw that error away; forward it to /login, which
    // already knows how to surface an error and, for an expired link, offer
    // to resend the confirmation email.
    if (typeof window !== "undefined") {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const description = query.get("error_description") || hash.get("error_description");
      if (description) {
        const code = query.get("error_code") || hash.get("error_code");
        const expiredFlag = code === "otp_expired" ? "&expired=1" : "";
        window.location.replace(`/login?error=${encodeURIComponent(description)}${expiredFlag}`);
        return null;
      }
    }
    return <LandingPage />;
  }

  if (state.loading || authLoading) {
    return (
      <div className="flex h-screen w-screen bg-[#F4F6F8] dark:bg-[#181b34]">
        <div className="w-16 bg-[#1A2C5B] shrink-0"></div>
        <div className="w-64 border-r border-gray-200 dark:border-slate-700 p-4 space-y-4 shrink-0">
          <div className="skeleton h-8 w-3/4 rounded-lg"></div>
          <div className="space-y-2 mt-6">
            <div className="skeleton h-5 w-1/3 rounded"></div>
            <div className="skeleton h-9 w-full rounded-md"></div>
            <div className="skeleton h-9 w-full rounded-md"></div>
            <div className="skeleton h-9 w-full rounded-md"></div>
          </div>
        </div>
        <div className="flex-1 p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className="skeleton h-8 w-48 rounded-lg"></div>
            <div className="flex gap-2 ml-auto">
              <div className="skeleton h-8 w-20 rounded-md"></div>
              <div className="skeleton h-8 w-20 rounded-md"></div>
              <div className="skeleton h-8 w-20 rounded-md"></div>
            </div>
          </div>
          <div className="skeleton h-10 w-full rounded-lg"></div>
          <div className="space-y-1">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton h-10 w-full rounded" style={{ opacity: 1 - i * 0.12 }}></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // Empty State (No workspaces) check
  // ============================================================
  const hasNoWorkspaces = !state.workspaces || state.workspaces.length === 0;

  // ============================================================
  // Main Layout
  // ============================================================

  return (
    <AssignablePeopleContext.Provider value={assignablePeopleIds}>
    <BoardAccessContext.Provider value={boardAccessValue}>
    <div className="flex h-screen w-screen overflow-visible bg-[#F4F6F8] dark:bg-[#181b34]">
      {/* Sidebar */}
      {workspacesLoading && state.workspaces.length === 0 ? (
        <SidebarSkeleton />
      ) : (
        <Sidebar
        profile={profile}
        profiles={state.profiles}
        workspaces={state.workspaces}
        activeWorkspace={state.activeWorkspace}
        companyLogoUrl={state.organizationSettings?.logo_url ?? null}
        boards={state.boards}
        activeBoard={state.activeBoard}
        mainView={state.mainView}
        showWorkspaceSidebar={state.showWorkspaceSidebar}
        onToggleSidebar={() => dispatch({ type: "SET_SHOW_SIDEBAR", payload: !state.showWorkspaceSidebar })}
        onSwitchBoard={store.switchBoard}
        onSetMainView={(view) => dispatch({ type: "SET_MAIN_VIEW", payload: view })}
        onCreateBoard={() => store.createBoard(state.activeWorkspace?.id, profile)}
        onRenameBoard={store.renameBoard}
        onDeleteBoard={store.deleteBoard}
        onNotificationClick={handleNotificationClick}
        canGoBack={appHistory.canGoBack}
        canGoForward={appHistory.canGoForward}
        onGoBack={appHistory.goBack}
        onGoForward={appHistory.goForward}
        onSelectWorkspace={selectWorkspace}
        onRenameWorkspace={store.renameWorkspace}
        onDeleteWorkspace={store.deleteWorkspace}
        onCreateWorkspace={() => store.createWorkspace(profile)}
        onSignOut={signOut}
        onOpenAdmin={() => {
          setAdminModalTarget(null);
          setShowAdminSettingsModal(true);
        }}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenProfileSettings={() => setShowProfileSettings(true)}
        onDuplicateWorkspace={handleDuplicateWorkspace}
        onImportData={() => setShowImportModal(true)}
      />
      )}

      {/* Main Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={state.mainView}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="flex-1 flex flex-col h-full overflow-hidden"
        >
          {state.mainView === "search" ? (
        <SearchView
          boards={state.boards}
          workspaces={state.workspaces}
          profiles={state.profiles}
          initialQuery={searchSeed}
          onSelectItem={(boardId, itemId) => navigateToItem(boardId, itemId)}
        />
      ) : state.mainView === "my_work" ? (
        <MyWorkView
          items={state.myWorkItems}
          boards={state.boards}
          workspaces={state.workspaces}
          onSelectItem={(item) => navigateToItem(item.board_id, item.id)}
          onBrowseWorkspaces={() => dispatch({ type: "SET_MAIN_VIEW", payload: "workspace_overview" })}
        />
      ) : state.mainView === "trash" ? (
        <TrashView
          trashItems={state.trashItems}
          groups={state.groups}
          allItems={[...state.items, ...state.trashItems]}
          onRestore={store.restoreItem}
          onDeletePermanently={store.permanentlyDeleteItem}
        />
      ) : hasNoWorkspaces && !state.loading ? (
        <div className="flex-1 overflow-auto">
          <EmptyState
            profile={profile}
            onCreateWorkspace={() => store.createWorkspace(profile)}
          />
        </div>
      ) : state.mainView === "workspace_overview" ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <WorkspaceOverview
            workspace={state.activeWorkspace}
            workspaces={state.workspaces}
            profile={profile}
            profiles={state.profiles}
            boards={state.activeWorkspace ? state.boards.filter(b => b.workspace_id === state.activeWorkspace!.id) : state.boards}
            onSelectBoard={(board) => {
              if (state.activeBoard?.id === board.id) {
                dispatch({ type: "SET_MAIN_VIEW", payload: "board" });
              } else {
                store.switchBoard(board);
              }
            }}
            onSelectWorkspace={selectWorkspace}
            onCreateBoard={() => store.createBoard(state.activeWorkspace?.id, profile)}
            onCreateWorkspace={() => store.createWorkspace(profile)}
            onImportData={() => setShowImportModal(true)}
          />
        </div>
      ) : state.mainView === "workspace_gantt" ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <WorkspaceGanttView
            workspaces={state.workspaces}
            allBoards={state.boards}
            defaultWorkspaceId={state.activeWorkspace?.id ?? null}
            profiles={state.profiles}
            onUpdateCell={handleWorkspaceGanttUpdate}
            onCreateLink={({ sourceId, targetId, type }) =>
              store.addLink(sourceId, targetId, "dependency", { depType: type })
            }
            onUpdateLink={(links, linkId, changes) =>
              store.updateLink(links, linkId, {
                depType: changes.type,
                lagDays: changes.lag,
              })
            }
            onDeleteLink={(linkId) => store.removeLink(linkId)}
            onRescheduleCells={(items, changes, summary) => {
              if (summary.cycleDetected) {
                toast.warning("These tasks depend on each other in a loop, so the plan could not be fully rescheduled.");
              }
              store.updateCells(items, changes, {
                message:
                  summary.movedCount > 0
                    ? `Moved ${summary.movedCount} dependent task${summary.movedCount === 1 ? "" : "s"}`
                    : undefined,
              });
            }}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {state.activeBoard ? (
            <>
              <BoardHeader
                boardName={state.activeBoard.name}
                mainView={state.mainView}
                columns={allColumns}
                profiles={state.profiles}
                searchQuery={filters.searchQuery}
                isAdmin={profile?.role === "admin"}
                filters={filters}
                onSetMainView={(view) => dispatch({ type: "SET_MAIN_VIEW", payload: view })}
                onSetSearchQuery={filters.setSearchQuery}
                onShowAutomations={() => dispatch({ type: "SET_SHOW_AUTOMATIONS", payload: true })}
                hiddenColumns={boardHiddenColumns}
                onToggleColumnVisibility={(colId) => store.toggleColumnVisibility(state.activeBoard!.id, colId)}
                onAddTask={() => setShowTaskModal(true)}
                onDuplicateBoard={handleDuplicateBoard}
                onImportData={() => setShowImportModal(true)}
              />

              <SampleRowsBanner
                items={state.items}
                onCleared={(ids) => {
                  for (const id of ids) dispatch({ type: "REMOVE_ITEM", payload: id });
                }}
              />

              {/* View Router */}
              {isBoardDataLoading && state.groups.length === 0 ? (
                <BoardSkeleton />
              ) : state.mainView === "board" ? (
                <BoardTableView
                  boardId={state.activeBoard.id}
                  boardName={state.activeBoard.name}
                  groups={state.groups}
                  filteredItems={filters.filteredItems}
                  allItems={state.items}
                  columns={visibleColumns}
                  profiles={state.profiles}
                  boardAutomations={state.boardAutomations}
                  editingGroupId={state.editingGroupId}
                  editGroupTitle={state.editGroupTitle}
                  addingToGroupId={state.addingToGroupId}
                  newItemName={state.newItemName}
                  activeStatusId={state.activeStatusId}
                  showAddColumnMenu={state.showAddColumnMenu}
                  itemMenuOpen={state.itemMenuOpen}
                  onSetEditingGroup={handleSetEditingGroup}
                  onRenameGroup={handleRenameGroup}
                  onDeleteGroup={store.deleteGroup}
                  onSetAddingToGroup={(id) => dispatch({ type: "SET_ADDING_TO_GROUP", payload: id })}
                  onSetNewItemName={(name) => dispatch({ type: "SET_NEW_ITEM_NAME", payload: name })}
                  onAddItem={handleAddItem}
                  onUpdateCell={handleUpdateCell}
                  onSelectItem={(item) => dispatch({ type: "SET_SELECTED_ITEM", payload: item })}
                  onDuplicateItem={store.duplicateItem}
                  onDeleteItem={store.deleteItem}
                  onSetActiveStatusId={(id) => dispatch({ type: "SET_ACTIVE_STATUS_ID", payload: id })}
                  onSetShowAddColumnMenu={(id) => dispatch({ type: "SET_SHOW_ADD_COLUMN_MENU", payload: id })}
                  onSetItemMenuOpen={(id) => dispatch({ type: "SET_ITEM_MENU_OPEN", payload: id })}
                  onAddColumn={handleAddColumn}
                  onRenameColumn={handleRenameColumn}
                  onResizeColumn={(colId, width) => store.resizeColumn(state.activeBoard!, colId, width)}
                  onDeleteColumn={handleDeleteColumn}
                  onChangeGroupColor={store.changeGroupColor}
                  onAddGroup={handleAddGroup}
                  onDragEnd={store.handleDragEnd}
                  onMoveGroup={store.moveGroup}
                  itemNameColumn={state.activeBoard.item_name_column || "Item"}
                  onRenameItemNameColumn={(newName: string) => store.updateBoardItemNameColumn(state.activeBoard!, newName)}
                  onRenameItem={store.renameItem}
                  collapsedGroups={state.collapsedGroups}
                  onToggleGroupCollapse={store.toggleGroupCollapse}
                />
              ) : null}

              {state.mainView === "kanban" && (
                <KanbanView
                  columns={visibleColumns}
                  groups={state.groups}
                  items={filters.filteredItems}
                  onUpdateCell={handleUpdateCell}
                  onSelectItem={(item) => dispatch({ type: "SET_SELECTED_ITEM", payload: item })}
                  profiles={state.profiles}
                />
              )}

              {state.mainView === "dashboard" && (
                <DashboardView
                  board={state.activeBoard}
                  groups={state.groups}
                  items={state.items}
                  profiles={state.profiles}
                  onOpenTask={(itemId) =>
                    navigateToItem(state.activeBoard?.id, itemId)
                  }
                />
              )}

              {state.mainView === "calendar" && (
                <CalendarView
                  board={state.activeBoard}
                  items={state.items}
                  groups={state.groups}
                  profiles={state.profiles}
                />
              )}

              {state.mainView === "gantt" && (
                <GanttView
                  board={state.activeBoard}
                  items={filters.filteredItems}
                  groups={state.groups}
                  itemLinks={state.itemLinks}
                  onUpdateItem={handleUpdateCell}
                  onRescheduleItems={handleGanttReschedule}
                  onCaptureBaseline={(baselines) => store.captureBaseline(state.items, baselines)}
                  onCreateLink={({ sourceId, targetId, type }) =>
                    store.addLink(sourceId, targetId, "dependency", { depType: type })
                  }
                  onUpdateLink={(linkId, changes) =>
                    store.updateLink(state.itemLinks, linkId, {
                      depType: changes.type,
                      lagDays: changes.lag,
                    })
                  }
                  onDeleteLink={(linkId) => store.removeLink(linkId)}
                  onMoveItem={handleGanttMoveItem}
                  collapsedGroups={state.collapsedGroups}
                  onToggleGroupCollapse={store.toggleGroupCollapse}
                  onSelectItem={(item) => dispatch({ type: "SET_SELECTED_ITEM", payload: item })}
                  profiles={state.profiles}
                />
              )}

              {state.mainView === "cards" && (
                <BoardCardsView
                  groups={state.groups}
                  filteredItems={filters.filteredItems}
                  columns={visibleColumns}
                  profiles={state.profiles}
                  onSelectItem={(item) => dispatch({ type: "SET_SELECTED_ITEM", payload: item })}
                  onUpdateCell={handleUpdateCell}
                  onAddItem={handleAddItem}
                  onDeleteItem={store.deleteItem}
                  onDuplicateItem={store.duplicateItem}
                />
              )}

              {state.mainView === "activity" && (
                <ActivityLog
                  board={state.activeBoard}
                  onOpenItem={(itemId) => navigateToItem(state.activeBoard?.id, itemId)}
                />
              )}

            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-pulse flex flex-col items-center">
                <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mb-4"></div>
                <div className="text-gray-400 font-medium">Loading board...</div>
              </div>
            </div>
          )}
        </div>
      )}
      </motion.div>
    </AnimatePresence>

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          activeBoard={state.activeBoard}
          activeBoardColumns={allColumns}
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
        />
      )}

      {/* Duplicating Overlay */}
      {isDuplicating && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-2xl flex flex-col items-center">
            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="font-semibold text-gray-900 dark:text-white">Duplicating...</p>
            <p className="text-sm text-gray-500 mt-1">This might take a moment for large templates.</p>
          </div>
        </div>
      )}

      {/* Item Detail Panel */}
      {state.selectedItem && state.activeBoard && profile && (
        <ItemPanel
          item={state.selectedItem}
          columns={state.activeBoard.columns}
          currentUser={{
            id: profile.id,
            name: profile.full_name,
            avatar: profile.avatar_initials,
            color: profile.color,
            avatar_url: profile.avatar_url,
          }}
          profiles={state.profiles}
          boardItems={state.items}
          onClose={() => dispatch({ type: "SET_SELECTED_ITEM", payload: null })}
          onUpdateCell={handleUpdateCell}
        />
      )}

      {/* Task Create Modal */}
      {showTaskModal && state.activeBoard && profile && (
        <TaskCreateModal
          board={state.activeBoard}
          groups={state.groups}
          profiles={state.profiles}
          items={state.items}
          onClose={() => setShowTaskModal(false)}
          onTaskCreate={async (groupId, name, columnValues) => {
            await store.addItem(groupId, name, state.activeBoard!, state.items, columnValues);
            setShowTaskModal(false);
          }}
        />
      )}

      {/* Automations Modal */}
      {state.showAutomations && state.activeBoard && (
        <AutomationsModal
          board={state.activeBoard}
          groups={state.groups}
          items={state.items}
          boardAutomations={state.boardAutomations}
          profiles={state.profiles}
          timeZone={state.organizationSettings?.default_timezone ?? null}
          onClose={() => dispatch({ type: "SET_SHOW_AUTOMATIONS", payload: false })}
        />
      )}

      {/* Admin Modal */}


      {/* Profile Settings Modal */}
      {showProfileSettings && profile && (
        <ProfileSettingsModal
          profile={profile}
          onClose={() => setShowProfileSettings(false)}
          onProfileUpdated={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.profiles() });
            refreshProfile();
          }}
        />
      )}

      {/* Comprehensive Settings Modal */}
      <SearchPalette
        open={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        boards={state.boards}
        workspaces={state.workspaces}
        profiles={state.profiles}
        onSelectItem={(boardId, itemId) => navigateToItem(boardId, itemId)}
        onSelectBoard={(boardId) => {
          const board = state.boards.find((b) => b.id === boardId);
          if (!board) return;
          if (state.activeBoard?.id === board.id) {
            dispatch({ type: "SET_MAIN_VIEW", payload: "board" });
          } else {
            store.switchBoard(board);
          }
        }}
        onSeeAll={(query) => {
          setSearchSeed(query);
          dispatch({ type: "SET_MAIN_VIEW", payload: "search" });
        }}
      />

      {showAdminSettingsModal && (
        <AdminSettingsModal
          onClose={() => {
            setShowAdminSettingsModal(false);
            setAdminModalTarget(null);
          }}
          organizationSettings={state.organizationSettings}
          teams={state.teams}
          profiles={state.profiles}
          onGlobalSettingsChanged={() => queryClient.invalidateQueries({ queryKey: queryKeys.globalSettings() })}
          initialTab={adminModalTarget?.tab}
          initialProfileId={adminModalTarget?.profileId}
        />
      )}

      {/* Readability & Font Modal */}
      {showReadabilityModal && (
        <ReadabilityModal onClose={() => setShowReadabilityModal(false)} />
      )}

      {/* Global Prompt Modal */}
      {store.PromptComponent}
      {store.WorkspaceDialogComponent}
    </div>
    </BoardAccessContext.Provider>
    </AssignablePeopleContext.Provider>
  );
}
// added for logging
