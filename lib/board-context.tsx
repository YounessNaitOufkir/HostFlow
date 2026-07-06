// ============================================================
// Board Context Provider
// Wraps the application with centralized state management
// ============================================================

"use client";

import React, { createContext, useContext, useReducer, useCallback, useMemo, useRef, useEffect, ReactNode } from "react";
import { boardReducer, initialState, BoardState, BoardAction } from "./store";
import { supabase } from "./supabase";
import type { BoardState as StoreState } from "./store";

// ============================================================
// Context Types
// ============================================================

interface BoardContextValue {
  state: BoardState;
  dispatch: React.Dispatch<BoardAction>;
  // Convenience methods
  setActiveBoard: (id: string | null) => void;
  setActiveWorkspace: (id: string | null) => void;
  setSelectedItem: (id: string | null) => void;
  setViewMode: (mode: "table" | "kanban" | "dashboard" | "calendar" | "gantt" | "my_work") => void;
  // Data methods
  fetchBoardData: (boardId: string) => Promise<void>;
  createItem: (groupId: string, name: string) => Promise<any>;
  updateCell: (itemId: string, columnId: string, value: any) => Promise<any>;
  deleteItem: (id: string) => Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

// ============================================================
// Provider Component
// ============================================================

export function BoardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(boardReducer, initialState);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Set active board with subscription management
  const setActiveBoard = useCallback((id: string | null) => {
    dispatch({ type: "SET_ACTIVE_BOARD", payload: id });
  }, []);

  const setActiveWorkspace = useCallback((id: string | null) => {
    dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: id });
  }, []);

  const setSelectedItem = useCallback((id: string | null) => {
    dispatch({ type: "SET_SELECTED_ITEM", payload: id });
  }, []);

  const setViewMode = useCallback((mode: BoardContextValue["setViewMode"] extends (mode: infer M) => void ? M : never) => {
    dispatch({ type: "SET_VIEW_MODE", payload: mode as any });
  }, []);

  // Fetch board data with groups and items
  const fetchBoardData = useCallback(async (boardId: string) => {
    dispatch({ type: "SET_LOADING", payload: { key: "items", value: true } });
    
    try {
      const [groupsRes, itemsRes] = await Promise.all([
        supabase.from("groups").select("*").eq("board_id", boardId).order("position"),
        supabase.from("items").select("*").eq("board_id", boardId).order("position"),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      dispatch({ type: "SET_GROUPS", payload: groupsRes.data || [] });
      dispatch({ type: "SET_ITEMS", payload: itemsRes.data || [] });
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: { key: "items", error: error as Error } });
    } finally {
      dispatch({ type: "SET_LOADING", payload: { key: "items", value: false } });
    }
  }, []);

  // Create a new item
  const createItem = useCallback(async (groupId: string, name: string) => {
    const boardId = state.activeBoardId;
    if (!boardId) throw new Error("No active board");

    const groupItems = state.items.allIds
      .map((id) => state.items.byId[id])
      .filter((i) => i.group_id === groupId);
    const position = groupItems.length > 0 
      ? Math.max(...groupItems.map((i) => i.position)) + 1 
      : 0;

    const { data, error } = await supabase
      .from("items")
      .insert({
        group_id: groupId,
        name,
        board_id: boardId,
        position,
        column_values: {},
      })
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "ADD_ITEM", payload: data });
    }
    return data;
  }, [state.activeBoardId, state.items]);

  // Update a cell value with optimistic update
  const updateCell = useCallback(async (itemId: string, columnId: string, value: any) => {
    const item = state.items.byId[itemId];
    if (!item) throw new Error("Item not found");

    const updatedColumnValues = {
      ...item.column_values,
      [columnId]: value,
    };

    // Optimistic update
    dispatch({
      type: "UPDATE_ITEM",
      payload: { ...item, column_values: updatedColumnValues },
    });

    const { data, error } = await supabase
      .from("items")
      .update({ column_values: updatedColumnValues })
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      // Rollback on error
      dispatch({ type: "UPDATE_ITEM", payload: item });
      throw error;
    }

    return data;
  }, [state.items.byId]);

  // Delete an item
  const deleteItem = useCallback(async (id: string) => {
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) throw error;
    dispatch({ type: "DELETE_ITEM", payload: id });
  }, []);

  // Setup realtime subscriptions
  useEffect(() => {
    if (!state.activeBoardId) return;

    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Create new subscription
    channelRef.current = supabase
      .channel(`board-${state.activeBoardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => {
        if (state.activeBoardId) {
          fetchBoardData(state.activeBoardId);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        if (state.activeBoardId) {
          fetchBoardData(state.activeBoardId);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "boards" }, () => {
        // Refetch boards
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [state.activeBoardId, fetchBoardData]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      setActiveBoard,
      setActiveWorkspace,
      setSelectedItem,
      setViewMode,
      fetchBoardData,
      createItem,
      updateCell,
      deleteItem,
    }),
    [
      state,
      setActiveBoard,
      setActiveWorkspace,
      setSelectedItem,
      setViewMode,
      fetchBoardData,
      createItem,
      updateCell,
      deleteItem,
    ]
  );

  return (
    <BoardContext.Provider value={value}>
      {children}
    </BoardContext.Provider>
  );
}

// ============================================================
// Hook to use the board context
// ============================================================

export function useBoardContext() {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error("useBoardContext must be used within a BoardProvider");
  }
  return context;
}

// ============================================================
// Convenience selector hooks
// ============================================================

export function useActiveBoard() {
  const { state } = useBoardContext();
  return state.activeBoardId ? state.boards.byId[state.activeBoardId] : null;
}

export function useActiveWorkspace() {
  const { state } = useBoardContext();
  return state.activeWorkspaceId ? state.workspaces.byId[state.activeWorkspaceId] : null;
}

export function useSelectedItem() {
  const { state } = useBoardContext();
  return state.selectedItemId ? state.items.byId[state.selectedItemId] : null;
}

export function useBoardGroups(boardId: string | null) {
  const { state } = useBoardContext();
  if (!boardId) return [];
  return state.groups.allIds
    .map((id) => state.groups.byId[id])
    .filter((g) => g.board_id === boardId)
    .sort((a, b) => a.position - b.position);
}

export function useBoardItems(boardId: string | null) {
  const { state } = useBoardContext();
  if (!boardId) return [];
  return state.items.allIds
    .map((id) => state.items.byId[id])
    .filter((i) => i.board_id === boardId);
}

export function useGroupItems(groupId: string) {
  const { state } = useBoardContext();
  return state.items.allIds
    .map((id) => state.items.byId[id])
    .filter((i) => i.group_id === groupId)
    .sort((a, b) => a.position - b.position);
}
