"use client";

// ============================================================
// Host'Lik PM — Main Application Page (Refactored Orchestrator)
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
import type { Board, Workspace } from "@/types";

import { duplicateBoard, duplicateWorkspace } from "@/lib/templateUtils";
import { executeImport } from "@/lib/importUtils";
import ImportModal, { ImportConfig } from "@/components/ImportModal";
import { AssignablePeopleContext } from "@/components/AssignablePeopleContext";
import { reportMutationError } from "@/lib/errorReporting";
import { toast } from "sonner";

// Layout components
import Sidebar from "@/components/layout/Sidebar";
import BoardHeader from "@/components/layout/BoardHeader";

// View components
import BoardTableView from "@/components/views/BoardTableView";
import KanbanView from "@/components/KanbanView";
import DashboardView from "@/components/DashboardView";
import CalendarView from "@/components/CalendarView";
import GanttView from "@/components/GanttView";
import MyWorkView from "@/components/MyWorkView";
import TrashView from "@/components/views/TrashView";
import BoardCardsView from "@/components/views/BoardCardsView";
import WorkspaceOverview from "@/components/WorkspaceOverview";
import WorkspaceGanttView from "@/components/WorkspaceGanttView";

// Feature components
import ItemPanel from "@/components/ItemPanel";
import AutomationsModal from "@/components/AutomationsModal";
import { BoardSkeleton } from "@/components/skeletons/BoardSkeleton";
import { SidebarSkeleton } from "@/components/skeletons/SidebarSkeleton";

import EmptyState from "@/components/EmptyState";
import ProfileSettingsModal from "@/components/ProfileSettingsModal";
import AdminSettingsModal from "@/components/AdminSettingsModal";
import ReadabilityModal from "@/components/ReadabilityModal";
import TaskCreateModal from "@/components/TaskCreateModal";

import type { ColumnType } from "@/types";

export default function MondayClone() {
  const { user, profile, loading: authLoading, signOut, refreshProfile } = useAuth();
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showAdminSettingsModal, setShowAdminSettingsModal] = useState(false);
  const [showReadabilityModal, setShowReadabilityModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const store = useBoardStore();
  const { state, dispatch } = store;
  const queryClient = useQueryClient();

  const boardHiddenColumns = state.activeBoard ? (state.hiddenColumns[state.activeBoard.id] || []) : [];
  const allColumns = state.activeBoard ? state.activeBoard.columns : [];
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
  const { data: settingsData } = useGlobalSettingsQuery(!authLoading);
  useEffect(() => {
    if (settingsData) {
      if (settingsData.organizationSettings) {
        dispatch({ type: "SET_ORGANIZATION_SETTINGS", payload: settingsData.organizationSettings });
      }
      dispatch({ type: "SET_TEAMS", payload: settingsData.teams });
    }
  }, [settingsData, dispatch]);

  const { data: workspacesData, isLoading: workspacesLoading } = useWorkspacesQuery(!authLoading);
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

  const { data: profilesData } = useProfilesQuery(!authLoading);
  useEffect(() => {
    if (profilesData) {
      dispatch({ type: "SET_PROFILES", payload: profilesData });
    }
  }, [profilesData, dispatch]);

  const { data: boardsData, isLoading: boardsLoading } = useBoardsQuery(!authLoading);

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
        const saved = readNavState(profile?.id);
        const savedBoard = saved?.boardId
          ? boardsData.find((b) => b.id === saved.boardId) || null
          : null;

        if (savedBoard) {
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

  const handleGlobalSettingsChanged = useCallback(
    () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.globalSettings() });
    },
    [queryClient]
  );

  useRealtimeSync({
    activeBoard: state.activeBoard,
    onBoardDataChanged: handleBoardDataChanged,
    onBoardsChanged: handleBoardsChanged,
    onGlobalSettingsChanged: handleGlobalSettingsChanged,
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
  const navigateToItem = useCallback((boardId?: string, itemId?: string) => {
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
        const itemToSelect = state.items.find(i => i.id === itemId);
        if (itemToSelect) {
          dispatch({ type: "SET_SELECTED_ITEM", payload: itemToSelect });
        } else {
          dispatch({ type: "SET_PENDING_SELECTED_ITEM", payload: itemId });
        }
      }
    }
  }, [state.activeBoard, state.boards, state.items, store.switchBoard, dispatch]);

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

  // The server already renders the right title via generateMetadata in
  // app/layout.tsx. This keeps it live: organization_settings is subscribed to for
  // realtime changes, so renaming the company retitles open tabs without a reload.
  // Sits above the early returns below, so the hook count cannot change between
  // renders.
  useEffect(() => {
    const name = state.organizationSettings?.company_name?.trim();
    if (name) document.title = name;
  }, [state.organizationSettings?.company_name]);

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
  if (!state.mounted) return null;

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
    <div className="flex h-screen w-screen overflow-visible bg-[#F4F6F8] dark:bg-[#181b34]">
      {/* Sidebar */}
      {workspacesLoading && state.workspaces.length === 0 ? (
        <SidebarSkeleton />
      ) : (
        <Sidebar
        profile={profile}
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
        onNotificationClick={navigateToItem}
        onSelectWorkspace={selectWorkspace}
        onRenameWorkspace={store.renameWorkspace}
        onDeleteWorkspace={store.deleteWorkspace}
        onCreateWorkspace={() => store.createWorkspace(profile)}
        onSignOut={signOut}
        onOpenAdmin={() => setShowAdminSettingsModal(true)}
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
          {state.mainView === "my_work" ? (
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
            allBoards={state.activeWorkspace ? state.boards.filter(b => b.workspace_id === state.activeWorkspace!.id) : state.boards}
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
                  items={state.items}
                  groups={state.groups}
                  itemLinks={state.itemLinks}
                  onUpdateItem={handleUpdateCell}
                  onMoveItem={handleGanttMoveItem}
                  collapsedGroups={state.collapsedGroups}
                  onToggleGroupCollapse={store.toggleGroupCollapse}
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
      {showAdminSettingsModal && (
        <AdminSettingsModal
          onClose={() => setShowAdminSettingsModal(false)}
          organizationSettings={state.organizationSettings}
          teams={state.teams}
          profiles={state.profiles}
          onGlobalSettingsChanged={() => queryClient.invalidateQueries({ queryKey: queryKeys.globalSettings() })}
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
    </AssignablePeopleContext.Provider>
  );
}
// added for logging
