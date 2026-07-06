// ============================================================
// Custom React Hooks for HostFlow
// Encapsulate data fetching, state management, and business logic
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import {
  Board,
  Group,
  Item,
  Profile,
  Workspace,
  Automation,
  Update,
  ActivityLog,
  Notification,
  BoardFilter,
  BoardSort,
  ViewMode,
  ItemLink,
  Column,
  CellValue,
} from "@/types";
import { useStore, selectBoards, selectActiveBoard, selectGroupsByBoardId, selectItemsByBoardId, selectSelectedItem, selectProfiles, selectWorkspaces, selectActiveWorkspace, selectNotifications, selectUnreadNotificationCount, selectAutomationsByBoardId, selectUpdatesByItemId, selectActivityLogsByItemId, filterItems, sortItems } from "./store";
import type { BoardState } from "./store";

// ============================================================
// Board Data Hook
// ============================================================

export function useBoardData(boardId: string | null) {
  const dispatch = useStore((s) => s);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBoardData = useCallback(async (id: string, skipLoading = false) => {
    if (!skipLoading) setLoading(true);
    setError(null);

    // Cancel any pending request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const [groupsRes, itemsRes] = await Promise.all([
        supabase.from("groups").select("*").eq("board_id", id).order("position"),
        supabase.from("items").select("*").eq("board_id", id).order("position"),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      dispatch({ type: "SET_GROUPS", payload: groupsRes.data || [] });
      dispatch({ type: "SET_ITEMS", payload: itemsRes.data || [] });
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch board data");
      setError(error);
      dispatch({ type: "SET_ERROR", payload: { key: "items", error } });
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    if (boardId) {
      fetchBoardData(boardId);
    }
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [boardId, fetchBoardData]);

  return { loading, error, refetch: () => boardId && fetchBoardData(boardId) };
}

// ============================================================
// Workspaces Hook
// ============================================================

export function useWorkspaces() {
  const dispatch = useStore((s) => s);
  const workspaces = useStore(selectWorkspaces);
  const activeWorkspace = useStore(selectActiveWorkspace);
  const profile = useStore((s) => s.profiles.byId[s.profiles.allIds[0]] || null);
  const [loading, setLoading] = useState(false);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from("workspaces").select("*").order("name");
      
      if (profile?.role === "limited" && profile.allowed_workspaces?.length) {
        query = query.in("id", profile.allowed_workspaces);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      dispatch({ type: "SET_WORKSPACES", payload: data || [] });
      
      if (data?.length && !activeWorkspace) {
        dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: data[0].id });
      }
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
    } finally {
      setLoading(false);
    }
  }, [dispatch, profile, activeWorkspace]);

  const createWorkspace = useCallback(async (name: string, description?: string) => {
    const { data, error } = await supabase
      .from("workspaces")
      .insert({ name, description })
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "SET_WORKSPACES", payload: [...workspaces, data] });
    }
    return data;
  }, [dispatch, workspaces]);

  const updateWorkspace = useCallback(async (id: string, updates: Partial<Workspace>) => {
    const { data, error } = await supabase
      .from("workspaces")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "SET_WORKSPACES", payload: workspaces.map((w) => w.id === id ? data : w) });
    }
    return data;
  }, [dispatch, workspaces]);

  const deleteWorkspace = useCallback(async (id: string) => {
    const { error } = await supabase.from("workspaces").delete().eq("id", id);
    if (error) throw error;
    dispatch({ type: "SET_WORKSPACES", payload: workspaces.filter((w) => w.id !== id) });
    if (activeWorkspace?.id === id) {
      const remaining = workspaces.filter((w) => w.id !== id);
      dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: remaining[0]?.id || null });
    }
  }, [dispatch, workspaces, activeWorkspace]);

  return {
    workspaces,
    activeWorkspace,
    loading,
    setActiveWorkspace: (id: string | null) => dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: id }),
    fetchWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
  };
}

// ============================================================
// Boards Hook
// ============================================================

export function useBoards(workspaceId: string | null) {
  const dispatch = useStore((s) => s);
  const boards = useStore(selectBoards);
  const activeBoard = useStore(selectActiveBoard);
  const [loading, setLoading] = useState(false);

  const fetchBoards = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from("boards")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("name");

      if (error) throw error;
      dispatch({ type: "SET_BOARDS", payload: data || [] });

      if (data?.length && !activeBoard) {
        dispatch({ type: "SET_ACTIVE_BOARD", payload: data[0].id });
      }
    } catch (err) {
      console.error("Failed to fetch boards:", err);
    } finally {
      setLoading(false);
    }
  }, [dispatch, workspaceId, activeBoard]);

  const createBoard = useCallback(async (name: string, description = "", columns?: Column[]) => {
    if (!workspaceId) throw new Error("No workspace selected");

    const defaultColumns: Column[] = columns || [
      { id: crypto.randomUUID(), title: "Status", type: "status" },
      { id: crypto.randomUUID(), title: "Assignee", type: "people" },
      { id: crypto.randomUUID(), title: "Due Date", type: "date" },
    ];

    const { data, error } = await supabase
      .from("boards")
      .insert({ 
        name, 
        description, 
        workspace_id: workspaceId,
        columns: defaultColumns 
      })
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "ADD_BOARD", payload: data });
      dispatch({ type: "SET_ACTIVE_BOARD", payload: data.id });
    }
    return data;
  }, [dispatch, workspaceId]);

  const updateBoard = useCallback(async (id: string, updates: Partial<Board>) => {
    const { data, error } = await supabase
      .from("boards")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "UPDATE_BOARD", payload: data });
    }
    return data;
  }, [dispatch]);

  const deleteBoard = useCallback(async (id: string) => {
    const { error } = await supabase.from("boards").delete().eq("id", id);
    if (error) throw error;
    dispatch({ type: "DELETE_BOARD", payload: id });
    if (activeBoard?.id === id) {
      const remaining = boards.filter((b) => b.id !== id);
      dispatch({ type: "SET_ACTIVE_BOARD", payload: remaining[0]?.id || null });
    }
  }, [dispatch, boards, activeBoard]);

  const addColumn = useCallback(async (boardId: string, column: Omit<Column, "id">) => {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error("Board not found");

    const newColumn: Column = {
      ...column,
      id: crypto.randomUUID(),
    };

    const updatedBoard = {
      ...board,
      columns: [...board.columns, newColumn],
    };

    return updateBoard(boardId, { columns: updatedBoard.columns });
  }, [boards, updateBoard]);

  const updateColumn = useCallback(async (boardId: string, columnId: string, updates: Partial<Column>) => {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error("Board not found");

    const updatedColumns = board.columns.map((c) =>
      c.id === columnId ? { ...c, ...updates } : c
    );

    return updateBoard(boardId, { columns: updatedColumns });
  }, [boards, updateBoard]);

  const deleteColumn = useCallback(async (boardId: string, columnId: string) => {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error("Board not found");

    const updatedColumns = board.columns.filter((c) => c.id !== columnId);
    return updateBoard(boardId, { columns: updatedColumns });
  }, [boards, updateBoard]);

  return {
    boards,
    activeBoard,
    loading,
    setActiveBoard: (id: string | null) => dispatch({ type: "SET_ACTIVE_BOARD", payload: id }),
    fetchBoards,
    createBoard,
    updateBoard,
    deleteBoard,
    addColumn,
    updateColumn,
    deleteColumn,
  };
}

// ============================================================
// Items Hook
// ============================================================

export function useItems(boardId: string | null) {
  const dispatch = useStore((s) => s);
  const items = useStore((s) => selectItemsByBoardId(s, boardId || ""));
  const board = useStore((s) => s.boards.byId[boardId || ""]);
  const [loading, setLoading] = useState(false);

  const createItem = useCallback(async (groupId: string, name: string, position?: number) => {
    if (!boardId) throw new Error("No board selected");

    const groupItems = items.filter((i) => i.group_id === groupId);
    const newPosition = position ?? (groupItems.length > 0 ? Math.max(...groupItems.map((i) => i.position)) + 1 : 0);

    const { data, error } = await supabase
      .from("items")
      .insert({
        group_id: groupId,
        name,
        board_id: boardId,
        position: newPosition,
        column_values: {},
      })
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "ADD_ITEM", payload: data });
    }
    return data;
  }, [dispatch, boardId, items]);

  const updateItem = useCallback(async (id: string, updates: Partial<Item>) => {
    const { data, error } = await supabase
      .from("items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "UPDATE_ITEM", payload: data });
    }
    return data;
  }, [dispatch]);

  const updateCell = useCallback(async (itemId: string, columnId: string, value: CellValue) => {
    const item = items.find((i) => i.id === itemId);
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
  }, [dispatch, items]);

  const deleteItem = useCallback(async (id: string) => {
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) throw error;
    dispatch({ type: "DELETE_ITEM", payload: id });
  }, [dispatch]);

  const moveItem = useCallback(async (
    itemId: string,
    targetGroupId: string,
    targetPosition: number
  ) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) throw new Error("Item not found");

    // Optimistic update
    dispatch({
      type: "UPDATE_ITEM",
      payload: { ...item, group_id: targetGroupId, position: targetPosition },
    });

    const { error } = await supabase
      .from("items")
      .update({ group_id: targetGroupId, position: targetPosition })
      .eq("id", itemId);

    if (error) {
      dispatch({ type: "UPDATE_ITEM", payload: item });
      throw error;
    }
  }, [dispatch, items]);

  const duplicateItem = useCallback(async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) throw new Error("Item not found");

    return createItem(item.group_id, `${item.name} (Copy)`, item.position + 1);
  }, [items, createItem]);

  return {
    items,
    board,
    loading,
    createItem,
    updateItem,
    updateCell,
    deleteItem,
    moveItem,
    duplicateItem,
  };
}

// ============================================================
// Groups Hook
// ============================================================

export function useGroups(boardId: string | null) {
  const dispatch = useStore((s) => s);
  const groups = useStore((s) => selectGroupsByBoardId(s, boardId || ""));
  const [loading, setLoading] = useState(false);

  const createGroup = useCallback(async (title: string, color?: string) => {
    if (!boardId) throw new Error("No board selected");

    const position = groups.length > 0 ? Math.max(...groups.map((g) => g.position)) + 1 : 0;
    const groupColor = color || generateGroupColor(groups.length);

    const { data, error } = await supabase
      .from("groups")
      .insert({
        title,
        color: groupColor,
        position,
        board_id: boardId,
      })
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "ADD_GROUP", payload: data });
    }
    return data;
  }, [dispatch, boardId, groups]);

  const updateGroup = useCallback(async (id: string, updates: Partial<Group>) => {
    const { data, error } = await supabase
      .from("groups")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "UPDATE_GROUP", payload: data });
    }
    return data;
  }, [dispatch]);

  const deleteGroup = useCallback(async (id: string) => {
    const { error } = await supabase.from("groups").delete().eq("id", id);
    if (error) throw error;
    dispatch({ type: "DELETE_GROUP", payload: id });
  }, [dispatch]);

  const reorderGroups = useCallback(async (reorderedGroups: Group[]) => {
    // Optimistic update
    dispatch({ type: "SET_GROUPS", payload: reorderedGroups });

    // Batch update positions
    const updates = reorderedGroups.map((g, index) =>
      supabase.from("groups").update({ position: index }).eq("id", g.id)
    );

    const results = await Promise.all(updates);
    const hasError = results.some((r) => r.error);

    if (hasError) {
      // Refetch on error
      const { data } = await supabase.from("groups").select("*").eq("board_id", boardId);
      if (data) {
        dispatch({ type: "SET_GROUPS", payload: data });
      }
    }
  }, [dispatch, boardId]);

  return {
    groups,
    loading,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
  };
}

// ============================================================
// Profiles Hook
// ============================================================

export function useProfiles() {
  const dispatch = useStore((s) => s);
  const profiles = useStore(selectProfiles);
  const [loading, setLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      dispatch({ type: "SET_PROFILES", payload: data || [] });
    } catch (err) {
      console.error("Failed to fetch profiles:", err);
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  const updateProfile = useCallback(async (id: string, updates: Partial<Profile>) => {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "UPDATE_PROFILE", payload: data });
    }
    return data;
  }, [dispatch]);

  return {
    profiles,
    loading,
    fetchProfiles,
    updateProfile,
  };
}

// ============================================================
// Notifications Hook
// ============================================================

export function useNotifications(userId: string | null) {
  const dispatch = useStore((s) => s);
  const notifications = useStore(selectNotifications);
  const unreadCount = useStore(selectUnreadNotificationCount);

  useEffect(() => {
    if (!userId) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (data) {
        dispatch({ type: "SET_NOTIFICATIONS", payload: data });
      }
    };

    fetchNotifications();

    // Subscribe to new notifications
    const channel = supabase
      .channel("notifications-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          dispatch({ type: "ADD_NOTIFICATION", payload: payload.new as Notification });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, dispatch]);

  const markAsRead = useCallback(async (id: string) => {
    dispatch({ type: "MARK_NOTIFICATION_READ", payload: id });
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }, [dispatch]);

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    notifications.forEach((n) => {
      if (!n.read) {
        dispatch({ type: "MARK_NOTIFICATION_READ", payload: n.id });
      }
    });
    for (const id of unreadIds) {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    }
  }, [dispatch, notifications]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  };
}

// ============================================================
// Automations Hook
// ============================================================

export function useAutomations(boardId: string | null) {
  const dispatch = useStore((s) => s);
  const automations = useStore((s) => selectAutomationsByBoardId(s, boardId || ""));

  const fetchAutomations = useCallback(async () => {
    if (!boardId) return;
    const { data } = await supabase
      .from("automations")
      .select("*")
      .eq("board_id", boardId)
      .order("created_at", { ascending: false });

    if (data) {
      dispatch({ type: "SET_AUTOMATIONS", payload: data });
    }
  }, [dispatch, boardId]);

  const createAutomation = useCallback(async (automation: Omit<Automation, "id" | "created_at">) => {
    const { data, error } = await supabase
      .from("automations")
      .insert(automation)
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "ADD_AUTOMATION", payload: data });
    }
    return data;
  }, [dispatch]);

  const updateAutomation = useCallback(async (id: string, updates: Partial<Automation>) => {
    const { data, error } = await supabase
      .from("automations")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "UPDATE_AUTOMATION", payload: data });
    }
    return data;
  }, [dispatch]);

  const deleteAutomation = useCallback(async (id: string) => {
    const { error } = await supabase.from("automations").delete().eq("id", id);
    if (error) throw error;
    dispatch({ type: "DELETE_AUTOMATION", payload: id });
  }, [dispatch]);

  const toggleAutomation = useCallback(async (id: string) => {
    const automation = automations.find((a) => a.id === id);
    if (!automation) return;
    return updateAutomation(id, { enabled: !automation.enabled });
  }, [automations, updateAutomation]);

  return {
    automations,
    fetchAutomations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleAutomation,
  };
}

// ============================================================
// Item Updates Hook
// ============================================================

export function useItemUpdates(itemId: string | null) {
  const dispatch = useStore((s) => s);
  const updates = useStore((s) => selectUpdatesByItemId(s, itemId || ""));

  useEffect(() => {
    if (!itemId) return;

    const fetchUpdates = async () => {
      const { data } = await supabase
        .from("updates")
        .select("*")
        .eq("item_id", itemId)
        .order("created_at", { ascending: false });

      if (data) {
        dispatch({ type: "SET_UPDATES", payload: data });
      }
    };

    fetchUpdates();

    const channel = supabase
      .channel(`updates-${itemId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "updates", filter: `item_id=eq.${itemId}` },
        (payload) => {
          dispatch({ type: "ADD_UPDATE", payload: payload.new as Update });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemId, dispatch]);

  const createUpdate = useCallback(async (body: string, authorId: string, authorName: string) => {
    if (!itemId) throw new Error("No item selected");

    const { data, error } = await supabase
      .from("updates")
      .insert({
        item_id: itemId,
        body,
        author_id: authorId,
        author_name: authorName,
      })
      .select()
      .single();

    if (error) throw error;
    if (data) {
      dispatch({ type: "ADD_UPDATE", payload: data });
    }
    return data;
  }, [dispatch, itemId]);

  return {
    updates,
    createUpdate,
  };
}

// ============================================================
// Activity Logs Hook
// ============================================================

export function useActivityLogs(itemId: string | null) {
  const dispatch = useStore((s) => s);
  const logs = useStore((s) => selectActivityLogsByItemId(s, itemId || ""));

  const fetchLogs = useCallback(async () => {
    if (!itemId) return;
    const { data } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      dispatch({ type: "SET_ACTIVITY_LOGS", payload: data });
    }
  }, [dispatch, itemId]);

  const logActivity = useCallback(async (
    action: string,
    details?: Record<string, any>
  ) => {
    if (!itemId) return;
    
    const { data } = await supabase
      .from("activity_logs")
      .insert({
        item_id: itemId,
        action,
        details,
      })
      .select()
      .single();

    if (data) {
      dispatch({ type: "ADD_ACTIVITY_LOG", payload: data });
    }
    return data;
  }, [dispatch, itemId]);

  return {
    logs,
    fetchLogs,
    logActivity,
  };
}

// ============================================================
// Filtered & Sorted Items Hook
// ============================================================

export function useFilteredItems(
  items: Item[],
  board: Board | null,
  filter: BoardFilter,
  sort: BoardSort | null
) {
  return useMemo(() => {
    let result = items;

    // Apply filter
    if (board) {
      result = filterItems(result, filter, board.columns);
    }

    // Apply sort
    result = sortItems(result, sort);

    return result;
  }, [items, board, filter, sort]);
}

// ============================================================
// Items by Group Hook
// ============================================================

export function useItemsByGroup(items: Item[]) {
  return useMemo(() => {
    const grouped: Record<string, Item[]> = {};
    
    items.forEach((item) => {
      if (!grouped[item.group_id]) {
        grouped[item.group_id] = [];
      }
      grouped[item.group_id].push(item);
    });

    // Sort items within each group by position
    Object.keys(grouped).forEach((groupId) => {
      grouped[groupId].sort((a, b) => a.position - b.position);
    });

    return grouped;
  }, [items]);
}

// ============================================================
// Cross-Board Linking Hook
// ============================================================

export function useItemLinks(sourceItemId: string | null) {
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLinks = useCallback(async () => {
    if (!sourceItemId) return;
    setLoading(true);
    
    try {
      const { data } = await supabase
        .from("item_links")
        .select("*")
        .or(`source_item_id.eq.${sourceItemId},target_item_id.eq.${sourceItemId}`);

      setLinks(data || []);
    } catch (err) {
      console.error("Failed to fetch item links:", err);
    } finally {
      setLoading(false);
    }
  }, [sourceItemId]);

  const createLink = useCallback(async (
    targetItemId: string,
    linkType: ItemLink["link_type"] = "relates_to"
  ) => {
    if (!sourceItemId) throw new Error("No source item");

    const { data, error } = await supabase
      .from("item_links")
      .insert({
        source_item_id: sourceItemId,
        target_item_id: targetItemId,
        link_type: linkType,
      })
      .select()
      .single();

    if (error) throw error;
    if (data) {
      setLinks((prev) => [...prev, data]);
    }
    return data;
  }, [sourceItemId]);

  const deleteLink = useCallback(async (linkId: string) => {
    const { error } = await supabase.from("item_links").delete().eq("id", linkId);
    if (error) throw error;
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  return {
    links,
    loading,
    createLink,
    deleteLink,
    refetch: fetchLinks,
  };
}

// ============================================================
// Formula Engine Hook
// ============================================================

export function useFormulaEngine(items: Item[], sourceColumnIds: string[]) {
  return useMemo(() => {
    return (operation: string): number | null => {
      if (sourceColumnIds.length === 0) return null;

      const values = items
        .map((item) => {
          // Get the first non-null value from source columns
          for (const colId of sourceColumnIds) {
            const val = item.column_values[colId];
            if (val != null) {
              const num = parseFloat(String(val));
              if (!isNaN(num)) return num;
            }
          }
          return null;
        })
        .filter((v): v is number => v !== null);

      if (values.length === 0) return null;

      switch (operation) {
        case "sum":
          return values.reduce((a, b) => a + b, 0);
        case "average":
          return values.reduce((a, b) => a + b, 0) / values.length;
        case "count":
          return values.length;
        case "min":
          return Math.min(...values);
        case "max":
          return Math.max(...values);
        default:
          return null;
      }
    };
  }, [items, sourceColumnIds]);
}

// ============================================================
// Helper Functions
// ============================================================

const GROUP_COLORS = [
  "#579bfc", // Blue
  "#00c875", // Green
  "#e2445c", // Red
  "#fdab3d", // Orange
  "#a25ddc", // Purple
  "#0086c0", // Cyan
  "#7c3aed", // Violet
  "#2563eb", // Blue 600
  "#059669", // Emerald
  "#dc2626", // Red 600
];

function generateGroupColor(index: number): string {
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

// ============================================================
// Board State Access Hook
// ============================================================

export function useBoardState(): BoardState {
  return useStore((s) => s);
}

// ============================================================
// Selected Item Hook
// ============================================================

export function useSelectedItem() {
  const dispatch = useStore((s) => s);
  const item = useStore(selectSelectedItem);

  const setSelectedItem = useCallback((id: string | null) => {
    dispatch({ type: "SET_SELECTED_ITEM", payload: id });
  }, [dispatch]);

  return {
    item,
    setSelectedItem,
  };
}

// ============================================================
// View Mode Hook
// ============================================================

export function useViewMode() {
  const dispatch = useStore((s) => s);
  const viewMode = useStore((s) => s.viewMode);
  const filter = useStore((s) => s.filter);
  const sort = useStore((s) => s.sort);

  const setViewMode = useCallback((mode: ViewMode) => {
    dispatch({ type: "SET_VIEW_MODE", payload: mode });
  }, [dispatch]);

  const setFilter = useCallback((newFilter: BoardFilter) => {
    dispatch({ type: "SET_FILTER", payload: newFilter });
  }, [dispatch]);

  const setSort = useCallback((newSort: BoardSort | null) => {
    dispatch({ type: "SET_SORT", payload: newSort });
  }, [dispatch]);

  const clearFilters = useCallback(() => {
    dispatch({ type: "SET_FILTER", payload: {} });
  }, [dispatch]);

  return {
    viewMode,
    filter,
    sort,
    setViewMode,
    setFilter,
    setSort,
    clearFilters,
  };
}
