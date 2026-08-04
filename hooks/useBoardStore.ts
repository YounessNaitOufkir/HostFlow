"use client";

// ============================================================
// useBoardStore — Central state management facade for HostFlow
// ============================================================
//
// Composes domain-specific hooks from ./store/:
// - useBoardFetching (workspaces, boards, profile, etc.)
// - useWorkspaceMutations (create/rename/delete workspace)
// - useBoardMutations (create/rename/delete/switch board)
// - useGroupMutations (add/rename/delete group, colors)
// - useItemMutations (add/update/delete item, cells, links, dnd)
// - useColumnMutations (add/rename/delete/resize column)
// ============================================================

import { useReducer, useEffect, useCallback } from "react";
import { usePromptModal } from "@/hooks/usePromptModal";
import { boardReducer, initialBoardStoreState } from "./store/boardReducer";
import { useBoardFetching } from "./store/useBoardFetching";
import { useWorkspaceMutations } from "./store/useWorkspaceMutations";
import { useBoardMutations } from "./store/useBoardMutations";
import { useGroupMutations } from "./store/useGroupMutations";
import { useItemMutations } from "./store/useItemMutations";
import { useColumnMutations } from "./store/useColumnMutations";
import type { BoardStoreState, BoardAction } from "./store/types";

export type { BoardStoreState, BoardAction };

export function useBoardStore() {
  const [state, dispatch] = useReducer(boardReducer, initialBoardStoreState);
  const { requestPrompt, PromptComponent } = usePromptModal();

  // --- Hydrate from localStorage on mount ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedCollapsed = localStorage.getItem(
        "monday_clone_collapsed_groups"
      );
      if (savedCollapsed) {
        try {
          const parsed = JSON.parse(savedCollapsed);
          if (Array.isArray(parsed)) {
            parsed.forEach((id: string) =>
              dispatch({ type: "TOGGLE_GROUP_COLLAPSE", payload: id })
            );
          }
        } catch (e) {}
      }

      const savedHidden = localStorage.getItem("monday_clone_hidden_columns");
      if (savedHidden) {
        try {
          const parsed = JSON.parse(savedHidden);
          if (parsed) {
            dispatch({ type: "SET_HIDDEN_COLUMNS", payload: parsed });
          }
        } catch (e) {}
      }
      const savedSidebar = localStorage.getItem("monday_clone_sidebar");
      if (savedSidebar !== null) {
        dispatch({
          type: "SET_SHOW_SIDEBAR",
          payload: savedSidebar === "true",
        });
      }
      const savedView = localStorage.getItem("monday_clone_main_view");
      if (savedView) {
        dispatch({ type: "SET_MAIN_VIEW", payload: savedView as any });
      }
    }
    dispatch({ type: "SET_MOUNTED" });
  }, []);

  // --- Persist state to localStorage ---
  useEffect(() => {
    if (state.mounted && !state.loading && typeof window !== "undefined") {
      localStorage.setItem(
        "monday_clone_sidebar",
        String(state.showWorkspaceSidebar)
      );
      localStorage.setItem("monday_clone_main_view", state.mainView);
      if (state.activeBoard) {
        localStorage.setItem(
          "monday_clone_active_board_id",
          state.activeBoard.id
        );
      } else if (state.activeBoard === null) {
        localStorage.removeItem("monday_clone_active_board_id");
      }

      if (state.activeWorkspace) {
        localStorage.setItem(
          "monday_clone_active_workspace_id",
          state.activeWorkspace.id
        );
      }
    }
  }, [
    state.showWorkspaceSidebar,
    state.mainView,
    state.activeBoard,
    state.activeWorkspace,
    state.mounted,
  ]);

  // --- Composed Domain Hooks ---
  const fetching = useBoardFetching(dispatch);
  const workspaceMutations = useWorkspaceMutations({
    dispatch,
    requestPrompt,
  });
  const boardMutations = useBoardMutations({
    dispatch,
    requestPrompt,
  });
  const groupMutations = useGroupMutations({
    dispatch,
    groups: state.groups,
    items: state.items,
  });
  const columnMutations = useColumnMutations({
    dispatch,
  });
  const itemMutations = useItemMutations({
    dispatch,
    items: state.items,
    trashItems: state.trashItems,
    itemLinks: state.itemLinks,
    reorderColumns: columnMutations.reorderColumns,
  });

  // --- Drag and Drop Helper ---
  const handleDragEnd = useCallback(
    (result: any) => {
      if (result.type === "GROUP") {
        if (!result.destination) return;
        groupMutations.reorderGroups(
          state.groups,
          result.source.index,
          result.destination.index
        );
        return;
      }
      itemMutations.handleDragEnd(result, state.activeBoard);
    },
    [groupMutations.reorderGroups, state.groups, itemMutations.handleDragEnd, state.activeBoard]
  );

  return {
    state,
    dispatch,
    // Data fetching
    fetchWorkspaces: fetching.fetchWorkspaces,
    fetchProfiles: fetching.fetchProfiles,
    fetchBoards: fetching.fetchBoards,
    fetchBoardData: fetching.fetchBoardData,
    fetchGlobalSettings: fetching.fetchGlobalSettings,
    fetchMyWorkItems: fetching.fetchMyWorkItems,
    // Board navigation
    switchBoard: boardMutations.switchBoard,
    // Column operations
    addColumn: columnMutations.addColumn,
    renameColumn: columnMutations.renameColumn,
    resizeColumn: columnMutations.resizeColumn,
    deleteColumn: columnMutations.deleteColumn,
    reorderColumns: columnMutations.reorderColumns,
    toggleColumnVisibility: columnMutations.toggleColumnVisibility,
    // Item operations
    updateCell: itemMutations.updateCell,
    addItem: itemMutations.addItem,
    deleteItem: itemMutations.deleteItem,
    restoreItem: itemMutations.restoreItem,
    duplicateItem: itemMutations.duplicateItem,
    renameItem: itemMutations.renameItem,
    // Item Link operations
    addLink: itemMutations.addLink,
    removeLink: itemMutations.removeLink,
    // Board CRUD
    createBoard: boardMutations.createBoard,
    renameBoard: boardMutations.renameBoard,
    deleteBoard: boardMutations.deleteBoard,
    updateBoardItemNameColumn: boardMutations.updateBoardItemNameColumn,
    // Group operations
    renameGroup: groupMutations.renameGroup,
    changeGroupColor: groupMutations.changeGroupColor,
    addGroup: groupMutations.addGroup,
    deleteGroup: groupMutations.deleteGroup,
    toggleGroupCollapse: groupMutations.toggleGroupCollapse,
    reorderGroups: groupMutations.reorderGroups,
    moveGroup: groupMutations.moveGroup,
    // Workspace operations
    renameWorkspace: workspaceMutations.renameWorkspace,
    deleteWorkspace: workspaceMutations.deleteWorkspace,
    createWorkspace: workspaceMutations.createWorkspace,
    // Drag & drop
    handleDragEnd,
    // UI Components
    PromptComponent,
  };
}
