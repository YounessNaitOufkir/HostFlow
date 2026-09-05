"use client";

// ============================================================
// useBoardStore — Central state management facade for HostFlow
// ============================================================
//
// Composes domain-specific hooks from ./store/:
// - useWorkspaceMutations (create/rename/delete workspace)
// - useBoardMutations (create/rename/delete/switch board)
// - useGroupMutations (add/rename/delete group, colors)
// - useItemMutations (add/update/delete item, cells, links, dnd)
// - useColumnMutations (add/rename/delete/resize column)
// ============================================================

import { useReducer, useEffect, useCallback } from "react";
import { usePromptModal } from "@/hooks/usePromptModal";
import { useWorkspaceDialog } from "@/hooks/useWorkspaceDialog";
import { STORAGE_KEYS, migrateLegacyStorageKeys } from "@/lib/storageKeys";
import { boardReducer, initialBoardStoreState } from "./store/boardReducer";
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
  const { requestWorkspace, WorkspaceDialogComponent } = useWorkspaceDialog();

  // --- Hydrate from localStorage on mount ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Anything still stored under the old `monday_clone_*` names moves across
      // first, so an existing browser keeps its preferences through the rename.
      migrateLegacyStorageKeys();

      const savedCollapsed = localStorage.getItem(STORAGE_KEYS.collapsedGroups);
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

      const savedHidden = localStorage.getItem(STORAGE_KEYS.hiddenColumns);
      if (savedHidden) {
        try {
          const parsed = JSON.parse(savedHidden);
          if (parsed) {
            dispatch({ type: "SET_HIDDEN_COLUMNS", payload: parsed });
          }
        } catch (e) {}
      }
      const savedSidebar = localStorage.getItem(STORAGE_KEYS.sidebar);
      if (savedSidebar !== null) {
        dispatch({
          type: "SET_SHOW_SIDEBAR",
          payload: savedSidebar === "true",
        });
      }
      // mainView, the active board and the active workspace are NOT restored
      // here any more. They are per-user and need the signed-in profile plus the
      // list of boards that user can actually still see, neither of which exists
      // at this point. app/page.tsx owns that, via lib/navState.
    }
    dispatch({ type: "SET_MOUNTED" });
  }, []);

  // --- Persist state to localStorage ---
  useEffect(() => {
    if (state.mounted && !state.loading && typeof window !== "undefined") {
      // Sidebar visibility stays per-browser: it is a display preference, not a
      // location, and it is the same whoever is signed in. The location itself
      // is persisted per user in app/page.tsx.
      localStorage.setItem(STORAGE_KEYS.sidebar, String(state.showWorkspaceSidebar));
    }
  }, [
    state.showWorkspaceSidebar,
    state.mainView,
    state.activeBoard,
    state.activeWorkspace,
    state.mounted,
  ]);

  // --- Composed Domain Hooks ---
  const workspaceMutations = useWorkspaceMutations({
    dispatch,
    requestPrompt,
    requestWorkspace,
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
    updateCells: itemMutations.updateCells,
    captureBaseline: itemMutations.captureBaseline,
    addItem: itemMutations.addItem,
    deleteItem: itemMutations.deleteItem,
    restoreItem: itemMutations.restoreItem,
    permanentlyDeleteItem: itemMutations.permanentlyDeleteItem,
    duplicateItem: itemMutations.duplicateItem,
    renameItem: itemMutations.renameItem,
    // Item Link operations
    addLink: itemMutations.addLink,
    updateLink: itemMutations.updateLink,
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
    WorkspaceDialogComponent,
  };
}
