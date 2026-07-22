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

import React, { useEffect, useCallback, useState } from "react";
import { DropResult } from "@hello-pangea/dnd";
import { AnimatePresence, motion } from "framer-motion";

// Hooks
import { useBoardStore } from "@/hooks/useBoardStore";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useFilters } from "@/hooks/useFilters";
import { useAuth } from "@/components/AuthProvider";

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
import WorkspaceOverview from "@/components/WorkspaceOverview";
import WorkspaceGanttView from "@/components/WorkspaceGanttView";

// Feature components
import ItemPanel from "@/components/ItemPanel";
import AutomationsModal from "@/components/AutomationsModal";
import AdminModal from "@/components/AdminModal";
import EmptyState from "@/components/EmptyState";
import ProfileSettingsModal from "@/components/ProfileSettingsModal";

import type { ColumnType } from "@/types";

export default function MondayClone() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [showProfileSettings, setShowProfileSettings] = useState(false);

  const store = useBoardStore();
  const { state, dispatch } = store;

  const activeColumns = state.activeBoard?.columns || [];

  // Filter hook
  const filters = useFilters(state.items, activeColumns);

  // ============================================================
  // Data Fetching — triggered on auth ready
  // ============================================================
  useEffect(() => {
    if (authLoading) return;
    store.fetchWorkspaces(profile);
    store.fetchProfiles();
    store.fetchBoards(profile, state.activeBoard).then((firstBoard) => {
      if (firstBoard) store.fetchBoardData(firstBoard.id);
    });
  }, [authLoading, profile]);

  // Fetch board data when active board changes
  useEffect(() => {
    if (state.activeBoard) {
      store.fetchBoardData(state.activeBoard.id);
    }
  }, [state.activeBoard?.id]);

  // Fetch my work items when entering my_work view
  useEffect(() => {
    if (state.mainView === "my_work" && profile) {
      store.fetchMyWorkItems(profile, state.boards);
    }
  }, [state.mainView, profile, state.boards]);

  // ============================================================
  // Realtime Subscriptions
  // ============================================================
  const handleBoardDataChanged = useCallback(
    (boardId: string) => store.fetchBoardData(boardId, true),
    [store.fetchBoardData]
  );

  const handleBoardsChanged = useCallback(
    () => store.fetchBoards(profile, state.activeBoard, true),
    [profile, state.activeBoard, store.fetchBoards]
  );

  useRealtimeSync({
    activeBoard: state.activeBoard,
    onBoardDataChanged: handleBoardDataChanged,
    onBoardsChanged: handleBoardsChanged,
  });

  // ============================================================
  // Memoized Callbacks for child components
  // ============================================================
  const handleUpdateCell = useCallback(
    (itemId: string, columnId: string, value: any) => {
      if (profile && state.activeBoard) {
        store.updateCell(state.items, state.activeBoard, state.boardAutomations, profile, itemId, columnId, value);
      }
    },
    [state.items, state.activeBoard, state.boardAutomations, profile, store.updateCell]
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

  const handleNotificationClick = useCallback((boardId?: string, itemId?: string) => {
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

  const handleRenameGroup = useCallback(
    (groupId: string, title: string) => store.renameGroup(groupId, title),
    [store.renameGroup]
  );

  // ============================================================
  // Render Guards
  // ============================================================
  if (!state.mounted) return null;

  if (state.loading || authLoading) {
    return (
      <div className="flex h-screen w-screen bg-[#f6f7fb] dark:bg-[#181b34]">
        <div className="w-16 bg-[#292f4c] shrink-0"></div>
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
    <div className="flex h-screen w-screen overflow-visible bg-[#f6f7fb] dark:bg-[#181b34]">
      {/* Sidebar */}
      <Sidebar
        profile={profile}
        workspaces={state.workspaces}
        activeWorkspace={state.activeWorkspace}
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
        onSelectWorkspace={(ws) => dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: ws })}
        onRenameWorkspace={store.renameWorkspace}
        onDeleteWorkspace={store.deleteWorkspace}
        onCreateWorkspace={() => store.createWorkspace(profile)}
        onSignOut={signOut}
        onOpenAdmin={() => dispatch({ type: "SET_SHOW_ADMIN", payload: true })}
        onOpenProfileSettings={() => setShowProfileSettings(true)}
      />

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
          onSelectItem={(item) => dispatch({ type: "SET_SELECTED_ITEM", payload: item })}
        />
      ) : state.mainView === "trash" ? (
        <TrashView
          trashItems={state.trashItems}
          groups={state.groups}
          allItems={[...state.items, ...state.trashItems]}
          onRestore={store.restoreItem}
        />
      ) : hasNoWorkspaces && !state.loading ? (
        <div className="flex-1 overflow-auto">
          <EmptyState
            profile={profile}
            onCreateWorkspace={() => store.createWorkspace(profile)}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {state.activeBoard ? (
            <>
              <BoardHeader
                boardName={state.activeBoard.name}
                mainView={state.mainView}
                columns={activeColumns}
                profiles={state.profiles}
                searchQuery={filters.searchQuery}
                filters={filters}
                onSetMainView={(view) => dispatch({ type: "SET_MAIN_VIEW", payload: view })}
                onSetSearchQuery={filters.setSearchQuery}
                onShowAutomations={() => dispatch({ type: "SET_SHOW_AUTOMATIONS", payload: true })}
              />

              {/* View Router */}
              {state.mainView === "board" && (
                <BoardTableView
                  boardId={state.activeBoard.id}
                  groups={state.groups}
                  filteredItems={filters.filteredItems}
                  allItems={state.items}
                  columns={activeColumns}
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
                  itemNameColumn={state.activeBoard.item_name_column || "Item"}
                  onRenameItemNameColumn={(newName: string) => store.updateBoardItemNameColumn(state.activeBoard!, newName)}
                  onRenameItem={store.renameItem}
                  collapsedGroups={state.collapsedGroups}
                  onToggleGroupCollapse={store.toggleGroupCollapse}
                />
              )}

              {state.mainView === "kanban" && (
                <KanbanView
                  columns={activeColumns}
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

            </>
          ) : (
            <>
              {state.mainView === "workspace_gantt" ? (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <WorkspaceGanttView
                    allBoards={state.activeWorkspace ? state.boards.filter(b => b.workspace_id === state.activeWorkspace!.id) : state.boards}
                  />
                </div>
              ) : (
                <WorkspaceOverview
                  workspace={state.activeWorkspace}
                  workspaces={state.workspaces}
                  boards={state.activeWorkspace ? state.boards.filter(b => b.workspace_id === state.activeWorkspace!.id) : state.boards}
                  onSelectBoard={(board) => {
                    store.switchBoard(board);
                  }}
                  onSelectWorkspace={(ws) => dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: ws })}
                  onCreateBoard={() => store.createBoard(state.activeWorkspace?.id, profile)}
                  onCreateWorkspace={() => store.createWorkspace(profile)}
                />
              )}
            </>
          )}
        </div>
      )}
      </motion.div>
    </AnimatePresence>

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

      {/* Automations Modal */}
      {state.showAutomations && state.activeBoard && (
        <AutomationsModal
          board={state.activeBoard}
          groups={state.groups}
          onClose={() => dispatch({ type: "SET_SHOW_AUTOMATIONS", payload: false })}
        />
      )}

      {/* Admin Modal */}
      {state.showAdminModal && (
        <AdminModal onClose={() => dispatch({ type: "SET_SHOW_ADMIN", payload: false })} />
      )}

      {/* Profile Settings Modal */}
      {showProfileSettings && profile && (
        <ProfileSettingsModal
          profile={profile}
          onClose={() => setShowProfileSettings(false)}
          onProfileUpdated={() => window.location.reload()}
        />
      )}

      {/* Global Prompt Modal */}
      {store.PromptComponent}
    </div>
  );
}