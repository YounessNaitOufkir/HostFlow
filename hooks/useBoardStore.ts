"use client";

// ============================================================
// useBoardStore — Central state management for board data
// ============================================================
//
// Uses useReducer for predictable state transitions.
// Replaces ~30 useState calls in the old monolith page.tsx.
// ============================================================

import { useReducer, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type {
  Board, Group, Item, Column, ColumnType,
  Workspace, Profile, Automation, Notification, ItemLink,
} from "@/types";
import { getDefaultTitle } from "@/lib/columnRegistry";
import { usePromptModal } from "@/hooks/usePromptModal";

// ============================================================
// State Shape
// ============================================================

export interface BoardStoreState {
  /** Global loading (initial page load) */
  loading: boolean;
  /** Has the component mounted (for SSR hydration safety) */
  mounted: boolean;

  // --- Workspace & Board navigation ---
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  boards: Board[];
  activeBoard: Board | null;

  // --- Board data ---
  groups: Group[];
  items: Item[];
  itemLinks: ItemLink[];
  boardAutomations: Automation[];
  profiles: Profile[];

  // --- UI state ---
  mainView: "board" | "kanban" | "dashboard" | "calendar" | "gantt" | "my_work" | "trash" | "workspace_overview" | "workspace_gantt";
  showWorkspaceSidebar: boolean;
  showAutomations: boolean;
  showAdminModal: boolean;
  selectedItem: Item | null;
  pendingSelectedItemId: string | null;

  // --- Cell editing state ---
  activeStatusId: string | null;
  showAddColumnMenu: string | null;
  addingToGroupId: string | null;
  newItemName: string;
  editingGroupId: string | null;
  editGroupTitle: string;
  itemMenuOpen: string | null;

  // --- My Work ---
  myWorkItems: Item[];

  // --- Trash ---
  trashItems: Item[];

  // --- Group Collapse ---
  collapsedGroups: string[];
}

const initialState: BoardStoreState = {
  loading: true,
  mounted: false,
  workspaces: [],
  activeWorkspace: null,
  boards: [],
  activeBoard: null,
  groups: [],
  items: [],
  itemLinks: [],
  boardAutomations: [],
  profiles: [],
  mainView: "board",
  showWorkspaceSidebar: true,
  showAutomations: false,
  showAdminModal: false,
  selectedItem: null,
  pendingSelectedItemId: null,
  activeStatusId: null,
  showAddColumnMenu: null,
  addingToGroupId: null,
  newItemName: "",
  editingGroupId: null,
  editGroupTitle: "",
  itemMenuOpen: null,
  myWorkItems: [],
  trashItems: [],
  collapsedGroups: [],
};

// ============================================================
// Actions
// ============================================================

type Action =
  | { type: "SET_MOUNTED" }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_WORKSPACES"; payload: { workspaces: Workspace[]; active: Workspace | null } }
  | { type: "SET_ACTIVE_WORKSPACE"; payload: Workspace | null }
  | { type: "UPDATE_WORKSPACE"; payload: Workspace }
  | { type: "REMOVE_WORKSPACE"; payload: string }
  | { type: "ADD_WORKSPACE"; payload: Workspace }
  | { type: "SET_BOARDS"; payload: Board[] }
  | { type: "SET_ACTIVE_BOARD"; payload: Board | null }
  | { type: "UPDATE_BOARD"; payload: Board }
  | { type: "ADD_BOARD"; payload: Board }
  | { type: "REMOVE_BOARD"; payload: string }
  | { type: "SET_BOARD_DATA"; payload: { groups: Group[]; items: Item[]; automations: Automation[]; itemLinks: ItemLink[] } }
  | { type: "SET_GROUPS"; payload: Group[] }
  | { type: "SET_ITEMS"; payload: Item[] }
  | { type: "UPDATE_ITEM"; payload: Item }
  | { type: "ADD_ITEM"; payload: Item }
  | { type: "REMOVE_ITEM"; payload: string }
  | { type: "REPLACE_TEMP_ITEM"; payload: { tempId: string; item: Item } }
  | { type: "ADD_GROUP"; payload: Group }
  | { type: "REPLACE_TEMP_GROUP"; payload: { tempId: string; group: Group } }
  | { type: "REMOVE_GROUP"; payload: string }
  | { type: "SET_PROFILES"; payload: Profile[] }
  | { type: "SET_AUTOMATIONS"; payload: Automation[] }
  | { type: "SET_ITEM_LINKS"; payload: ItemLink[] }
  | { type: "ADD_ITEM_LINK"; payload: ItemLink }
  | { type: "REMOVE_ITEM_LINK"; payload: string }
  | { type: "SET_MAIN_VIEW"; payload: BoardStoreState["mainView"] }
  | { type: "SET_SHOW_SIDEBAR"; payload: boolean }
  | { type: "SET_SHOW_AUTOMATIONS"; payload: boolean }
  | { type: "SET_SHOW_ADMIN"; payload: boolean }
  | { type: "SET_SELECTED_ITEM"; payload: Item | null }
  | { type: "SET_PENDING_SELECTED_ITEM"; payload: string | null }
  | { type: "SET_ACTIVE_STATUS_ID"; payload: string | null }
  | { type: "SET_SHOW_ADD_COLUMN_MENU"; payload: string | null }
  | { type: "SET_ADDING_TO_GROUP"; payload: string | null }
  | { type: "SET_NEW_ITEM_NAME"; payload: string }
  | { type: "SET_EDITING_GROUP"; payload: { id: string | null; title: string } }
  | { type: "SET_ITEM_MENU_OPEN"; payload: string | null }
  | { type: "SET_MY_WORK_ITEMS"; payload: Item[] }
  | { type: "SET_TRASH_ITEMS"; payload: Item[] }
  | { type: "ADD_TRASH_ITEM"; payload: Item }
  | { type: "REMOVE_TRASH_ITEM"; payload: string }
  | { type: "TOGGLE_GROUP_COLLAPSE"; payload: string };

// ============================================================
// Reducer
// ============================================================

function boardReducer(state: BoardStoreState, action: Action): BoardStoreState {
  switch (action.type) {
    case "SET_MOUNTED":
      return { ...state, mounted: true };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_WORKSPACES":
      return { ...state, workspaces: action.payload.workspaces, activeWorkspace: action.payload.active };
    case "SET_ACTIVE_WORKSPACE":
      return { ...state, activeWorkspace: action.payload };
    case "UPDATE_WORKSPACE":
      return {
        ...state,
        workspaces: state.workspaces.map((w) =>
          w.id === action.payload.id ? action.payload : w
        ),
        activeWorkspace:
          state.activeWorkspace?.id === action.payload.id
            ? action.payload
            : state.activeWorkspace,
      };
    case "REMOVE_WORKSPACE": {
      const updated = state.workspaces.filter((w) => w.id !== action.payload);
      return {
        ...state,
        workspaces: updated,
        activeWorkspace:
          state.activeWorkspace?.id === action.payload
            ? updated[0] || null
            : state.activeWorkspace,
      };
    }
    case "ADD_WORKSPACE":
      return { ...state, workspaces: [...state.workspaces, action.payload] };
    case "SET_BOARDS":
      return { ...state, boards: action.payload };
    case "SET_ACTIVE_BOARD":
      return { ...state, activeBoard: action.payload };
    case "UPDATE_BOARD":
      return {
        ...state,
        boards: state.boards.map((b) =>
          b.id === action.payload.id ? action.payload : b
        ),
        activeBoard:
          state.activeBoard?.id === action.payload.id
            ? action.payload
            : state.activeBoard,
      };
    case "ADD_BOARD":
      return { ...state, boards: [...state.boards, action.payload] };
    case "REMOVE_BOARD": {
      const updated = state.boards.filter((b) => b.id !== action.payload);
      return {
        ...state,
        boards: updated,
        activeBoard:
          state.activeBoard?.id === action.payload
            ? updated[0] || null
            : state.activeBoard,
      };
    }
    case "SET_BOARD_DATA":
      return {
        ...state,
        groups: action.payload.groups,
        items: action.payload.items,
        itemLinks: action.payload.itemLinks,
        boardAutomations: action.payload.automations,
      };
    case "SET_GROUPS":
      return { ...state, groups: action.payload };
    case "SET_ITEMS":
      return { ...state, items: action.payload };
    case "UPDATE_ITEM": {
      const idx = state.items.findIndex((i) => i.id === action.payload.id);
      if (idx === -1) return state;
      const newItems = [...state.items];
      newItems[idx] = action.payload;
      return { ...state, items: newItems };
    }
    case "ADD_ITEM":
      return { ...state, items: [...state.items, action.payload] };
    case "REMOVE_ITEM":
      return { ...state, items: state.items.filter((i) => i.id !== action.payload) };
    case "REPLACE_TEMP_ITEM":
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.payload.tempId ? action.payload.item : i
        ),
      };
    case "ADD_GROUP":
      return { ...state, groups: [...state.groups, action.payload] };
    case "REPLACE_TEMP_GROUP":
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.payload.tempId ? action.payload.group : g
        ),
      };
    case "REMOVE_GROUP":
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.payload),
        items: state.items.filter((i) => i.group_id !== action.payload),
      };
    case "SET_PROFILES":
      return { ...state, profiles: action.payload };
    case "SET_AUTOMATIONS":
      return { ...state, boardAutomations: action.payload };
    case "SET_ITEM_LINKS":
      return { ...state, itemLinks: action.payload };
    case "ADD_ITEM_LINK":
      return { ...state, itemLinks: [...state.itemLinks, action.payload] };
    case "REMOVE_ITEM_LINK":
      return { ...state, itemLinks: state.itemLinks.filter(link => link.id !== action.payload) };
    case "SET_MAIN_VIEW":
      return { ...state, mainView: action.payload };
    case "SET_SHOW_SIDEBAR":
      return { ...state, showWorkspaceSidebar: action.payload };
    case "SET_SHOW_AUTOMATIONS":
      return { ...state, showAutomations: action.payload };
    case "SET_SHOW_ADMIN":
      return { ...state, showAdminModal: action.payload };
    case "SET_SELECTED_ITEM":
      return { ...state, selectedItem: action.payload, pendingSelectedItemId: null };
    case "SET_PENDING_SELECTED_ITEM":
      return { ...state, pendingSelectedItemId: action.payload };
    case "SET_ACTIVE_STATUS_ID":
      return { ...state, activeStatusId: action.payload };
    case "SET_SHOW_ADD_COLUMN_MENU":
      return { ...state, showAddColumnMenu: action.payload };
    case "SET_ADDING_TO_GROUP":
      return { ...state, addingToGroupId: action.payload };
    case "SET_NEW_ITEM_NAME":
      return { ...state, newItemName: action.payload };
    case "SET_EDITING_GROUP":
      return { ...state, editingGroupId: action.payload.id, editGroupTitle: action.payload.title };
    case "SET_ITEM_MENU_OPEN":
      return { ...state, itemMenuOpen: action.payload };
    case "SET_MY_WORK_ITEMS":
      return { ...state, myWorkItems: action.payload };
    case "SET_TRASH_ITEMS":
      return { ...state, trashItems: action.payload };
    case "ADD_TRASH_ITEM":
      return { ...state, trashItems: [...state.trashItems, action.payload] };
    case "REMOVE_TRASH_ITEM":
      return { ...state, trashItems: state.trashItems.filter(i => i.id !== action.payload) };
    case "TOGGLE_GROUP_COLLAPSE":
      return {
        ...state,
        collapsedGroups: state.collapsedGroups.includes(action.payload)
          ? state.collapsedGroups.filter(id => id !== action.payload)
          : [...state.collapsedGroups, action.payload]
      };
    default:
      return state;
  }
}

// ============================================================
// Hook
// ============================================================

export function useBoardStore() {
  const [state, dispatch] = useReducer(boardReducer, initialState);
  const { requestPrompt, PromptComponent } = usePromptModal();

  // --- Mount & LocalStorage Sync ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSidebar = localStorage.getItem("monday_clone_sidebar");
      if (savedSidebar !== null) {
        dispatch({ type: "SET_SHOW_SIDEBAR", payload: savedSidebar === "true" });
      }
      const savedView = localStorage.getItem("monday_clone_main_view");
      if (savedView) {
        dispatch({ type: "SET_MAIN_VIEW", payload: savedView as any });
      }
    }
    dispatch({ type: "SET_MOUNTED" });
  }, []);

  useEffect(() => {
    if (state.mounted && !state.loading && typeof window !== "undefined") {
      localStorage.setItem("monday_clone_sidebar", String(state.showWorkspaceSidebar));
      localStorage.setItem("monday_clone_main_view", state.mainView);
      if (state.activeBoard) {
        localStorage.setItem("monday_clone_active_board_id", state.activeBoard.id);
      } else if (state.activeBoard === null) {
        localStorage.removeItem("monday_clone_active_board_id");
      }
      
      if (state.activeWorkspace) {
        localStorage.setItem("monday_clone_active_workspace_id", state.activeWorkspace.id);
      }
    }
  }, [state.showWorkspaceSidebar, state.mainView, state.activeBoard, state.activeWorkspace, state.mounted]);

  // --- Data fetching ---
  const fetchWorkspaces = useCallback(async (profile: Profile | null) => {
    try {
      let query = supabase.from("workspaces").select("*").order("name");
      if (profile?.role === "contractor" && profile.allowed_workspaces?.length) {
        query = query.in("id", profile.allowed_workspaces);
      } else if (profile?.role === "contractor") {
        dispatch({ type: "SET_WORKSPACES", payload: { workspaces: [], active: null } });
        return;
      }
      const { data } = await query;
      if (data && data.length > 0) {
        const savedWsId = typeof window !== "undefined" ? localStorage.getItem("monday_clone_active_workspace_id") : null;
        const savedWs = savedWsId ? data.find(ws => ws.id === savedWsId) : null;
        dispatch({ type: "SET_WORKSPACES", payload: { workspaces: data, active: savedWs || null } });
      } else {
        dispatch({ type: "SET_WORKSPACES", payload: { workspaces: [], active: null } });
      }
    } catch (err) {
      console.error("Failed to fetch workspaces", err);
    }
  }, []);

  const fetchProfiles = useCallback(async () => {
    try {
      const { data } = await supabase.from("profiles").select("*");
      if (data) dispatch({ type: "SET_PROFILES", payload: data });
    } catch (err) {
      console.error("Failed to fetch profiles", err);
    }
  }, []);

  const fetchBoards = useCallback(async (profile: Profile | null, currentActiveBoard: Board | null, silent = false) => {
    if (!silent && !currentActiveBoard) dispatch({ type: "SET_LOADING", payload: true });
    try {
      let query = supabase.from("boards").select("*").order("id");
      if (profile?.role === "contractor" && profile.allowed_boards?.length) {
        query = query.in("id", profile.allowed_boards);
      } else if (profile?.role === "contractor") {
        dispatch({ type: "SET_BOARDS", payload: [] });
        dispatch({ type: "SET_ACTIVE_BOARD", payload: null });
        dispatch({ type: "SET_LOADING", payload: false });
        return null;
      }
      const { data } = await query;
      if (data && data.length > 0) {
        dispatch({ type: "SET_BOARDS", payload: data });
        if (!currentActiveBoard) {
          const savedBoardId = typeof window !== "undefined" ? localStorage.getItem("monday_clone_active_board_id") : null;
          const savedBoard = savedBoardId ? data.find(b => b.id === savedBoardId) : null;
          dispatch({ type: "SET_ACTIVE_BOARD", payload: savedBoard || null });
          dispatch({ type: "SET_LOADING", payload: false });
          return savedBoard || null;
        } else {
          const updated = data.find((b) => b.id === currentActiveBoard.id);
          if (updated) dispatch({ type: "SET_ACTIVE_BOARD", payload: updated });
          dispatch({ type: "SET_LOADING", payload: false });
          return null;
        }
      } else {
        dispatch({ type: "SET_BOARDS", payload: [] });
        dispatch({ type: "SET_ACTIVE_BOARD", payload: null });
        dispatch({ type: "SET_LOADING", payload: false });
      }
    } catch (err) {
      console.error("Error fetching boards:", err);
      dispatch({ type: "SET_LOADING", payload: false });
    }
    return null;
  }, []);

  const fetchBoardData = useCallback(async (boardId: string, silent = false) => {
    try {
      const [groupsRes, itemsRes, automationsRes] = await Promise.all([
        supabase.from("groups").select("*").eq("board_id", boardId).order("position"),
        supabase.from("items").select("*").eq("board_id", boardId).order("position"),
        supabase.from("automations").select("*").eq("board_id", boardId),
      ]);
      
      let fetchedLinks: ItemLink[] = [];
      const allItems = itemsRes.data || [];
      const activeItems = allItems.filter((i: Item) => !i.deleted_at);
      const trashItems = allItems.filter((i: Item) => !!i.deleted_at);

      if (allItems.length > 0) {
        const itemIds = allItems.map((i: Item) => i.id);
        const { data: linksData } = await supabase
          .from("item_links")
          .select("*")
          .or(`source_item_id.in.(${itemIds.join(',')}),target_item_id.in.(${itemIds.join(',')})`);
        if (linksData) fetchedLinks = linksData;
      }

      dispatch({
        type: "SET_BOARD_DATA",
        payload: {
          groups: groupsRes.data || [],
          items: activeItems,
          automations: automationsRes.data || [],
          itemLinks: fetchedLinks,
        },
      });
      dispatch({ type: "SET_TRASH_ITEMS", payload: trashItems });
    } catch (err) {
      console.error("Error fetching board data:", err);
    }
    if (!silent) dispatch({ type: "SET_LOADING", payload: false });
  }, []);

  const fetchMyWorkItems = useCallback(async (profile: Profile, boards: Board[]) => {
    try {
      const { data } = await supabase.from("items").select("*");
      if (data) {
        const myItems = data.filter((item) => {
          const board = boards.find((b) => b.id === item.board_id);
          if (!board) return false;
          const peopleCols = board.columns.filter((c) => c.type === "people");
          return peopleCols.some((col) => {
            const val = item.column_values?.[col.id];
            return Array.isArray(val) && val.includes(profile.id);
          });
        });
        dispatch({ type: "SET_MY_WORK_ITEMS", payload: myItems });
      }
    } catch (err) {
      console.error("Failed to fetch my work items:", err);
    }
  }, []);

  // --- Mutations ---
  const switchBoard = useCallback((board: Board | null) => {
    dispatch({ type: "SET_ACTIVE_BOARD", payload: board });
    if (board) {
      dispatch({ type: "SET_GROUPS", payload: [] });
      dispatch({ type: "SET_ITEMS", payload: [] });
      dispatch({ type: "SET_MAIN_VIEW", payload: "board" });
      fetchBoardData(board.id);
    } else {
      dispatch({ type: "SET_MAIN_VIEW", payload: "workspace_overview" });
    }
  }, [fetchBoardData]);

  const addColumn = useCallback(async (activeBoard: Board, type: ColumnType) => {
    dispatch({ type: "SET_SHOW_ADD_COLUMN_MENU", payload: null });
    const newColId = `${type}_${Date.now()}`;
    const newColTitle = getDefaultTitle(type);
    const currentColumns = activeBoard.columns || [];
    const newColumn: Column = { id: newColId, title: newColTitle, type };
    const updatedColumns = [...currentColumns, newColumn];
    const updatedBoard = { ...activeBoard, columns: updatedColumns };
    dispatch({ type: "UPDATE_BOARD", payload: updatedBoard });
    try {
      await supabase.from("boards").update({ columns: updatedColumns }).eq("id", activeBoard.id);
    } catch (err) {
      console.error("Failed to add column", err);
    }
  }, []);

  const renameColumn = useCallback(async (activeBoard: Board, columnId: string, newTitle: string) => {
    const updatedColumns = (activeBoard.columns || []).map((col) =>
      col.id === columnId ? { ...col, title: newTitle } : col
    );
    dispatch({ type: "UPDATE_BOARD", payload: { ...activeBoard, columns: updatedColumns } });
    try {
      await supabase.from("boards").update({ columns: updatedColumns }).eq("id", activeBoard.id);
    } catch (err) {
      console.error("Failed to rename column", err);
    }
  }, []);

  const resizeColumn = useCallback(async (activeBoard: Board, columnId: string, width: number) => {
    const updatedColumns = (activeBoard.columns || []).map((col) =>
      col.id === columnId ? { ...col, width } : col
    );
    dispatch({ type: "UPDATE_BOARD", payload: { ...activeBoard, columns: updatedColumns } });
    try {
      await supabase.from("boards").update({ columns: updatedColumns }).eq("id", activeBoard.id);
    } catch (err) {
      console.error("Failed to resize column", err);
    }
  }, []);

  const deleteColumn = useCallback(async (activeBoard: Board, columnId: string) => {
    if (!window.confirm("Are you sure you want to delete this column?")) return;
    const updatedColumns = (activeBoard.columns || []).filter((col) => col.id !== columnId);
    dispatch({ type: "UPDATE_BOARD", payload: { ...activeBoard, columns: updatedColumns } });
    try {
      await supabase.from("boards").update({ columns: updatedColumns }).eq("id", activeBoard.id);
    } catch (err) {
      console.error("Failed to delete column", err);
    }
  }, []);

  const reorderColumns = useCallback(async (activeBoard: Board, startIndex: number, endIndex: number) => {
    const cols = [...(activeBoard.columns || [])];
    const [moved] = cols.splice(startIndex, 1);
    cols.splice(endIndex, 0, moved);
    dispatch({ type: "UPDATE_BOARD", payload: { ...activeBoard, columns: cols } });
    try {
      await supabase.from("boards").update({ columns: cols }).eq("id", activeBoard.id);
    } catch (err) {
      console.error("Failed to reorder columns", err);
    }
  }, []);

  const updateCell = useCallback(async (
    items: Item[],
    activeBoard: Board,
    boardAutomations: Automation[],
    profile: Profile,
    itemId: string,
    columnId: string,
    newValue: any
  ) => {
    dispatch({ type: "SET_ACTIVE_STATUS_ID", payload: null });
    const itemIndex = items.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) return;

    const itemToUpdate = items[itemIndex];
    const existingValues = itemToUpdate.column_values || {};
    const updatedValues = { ...existingValues, [columnId]: newValue };

    const updatedItem = { ...itemToUpdate, column_values: updatedValues };
    dispatch({ type: "UPDATE_ITEM", payload: updatedItem });

    // Check for people assignment notifications
    const isPeopleColumn = activeBoard.columns?.find((c) => c.id === columnId)?.type === "people";
    const newlyAssigned = Array.isArray(newValue) && isPeopleColumn
      ? newValue.filter((id: string) => !Array.isArray(existingValues[columnId]) || !existingValues[columnId].includes(id))
      : [];

    try {
      let targetGroupId = itemToUpdate.group_id;

      // Check automation rules
      const matchedRule = boardAutomations.find(
        (a) =>
          a.trigger_column_id === columnId &&
          newValue === a.trigger_value &&
          a.action_type === "move_group" &&
          a.enabled !== false
      );

      if (matchedRule) {
        targetGroupId = matchedRule.action_target_id;
        const movedItem = { ...updatedItem, group_id: targetGroupId };
        dispatch({ type: "UPDATE_ITEM", payload: movedItem });
      }

      await supabase.from("items").update({
        column_values: updatedValues,
        group_id: targetGroupId,
      }).eq("id", itemId);

      // --- Timeline Dependency Cascading ---
      const columnDef = activeBoard.columns.find((c) => c.id === columnId);
      if (columnDef?.type === "timeline" && existingValues[columnId]?.start && newValue?.start) {
        const oldStart = new Date(existingValues[columnId].start).getTime();
        const newStart = new Date(newValue.start).getTime();
        const diffDays = Math.round((newStart - oldStart) / (1000 * 60 * 60 * 24));
        
        if (diffDays !== 0) {
          const { data: deps } = await supabase
            .from("item_links")
            .select("source_item_id")
            .eq("target_item_id", itemId)
            .eq("link_type", "dependency");
            
          if (deps && deps.length > 0) {
            const depIds = deps.map((d: any) => d.source_item_id);
            // We only need to shift items that are currently in memory
            for (const depId of depIds) {
              const depItemIndex = items.findIndex((i) => i.id === depId);
              if (depItemIndex !== -1) {
                const depItem = items[depItemIndex];
                const depTimeline = depItem.column_values?.[columnId];
                if (depTimeline?.start && depTimeline?.end) {
                  const newDepStart = new Date(new Date(depTimeline.start).getTime() + diffDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                  const newDepEnd = new Date(new Date(depTimeline.end).getTime() + diffDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                  const shiftedValues = { ...depItem.column_values, [columnId]: { start: newDepStart, end: newDepEnd } };
                  const shiftedItem = { ...depItem, column_values: shiftedValues };
                  
                  dispatch({ type: "UPDATE_ITEM", payload: shiftedItem });
                  await supabase.from("items").update({ column_values: shiftedValues }).eq("id", depId);
                }
              }
            }
          }
        }
      }

      // --- Chronological Auto-Sort (Removed) ---
      // Items are no longer auto-sorted on date changes to allow free dragging

      // Activity log
      const colName = activeBoard.columns.find((c) => c.id === columnId)?.title || columnId;
      const oldValue = existingValues[columnId] || "Empty";
      await supabase.from("activity_logs").insert({
        item_id: itemId,
        board_id: activeBoard.id,
        user_id: profile.id,
        action: `Changed "${colName}" from "${oldValue}" to "${newValue}"`,
      });

      // Notifications for newly assigned people
      if (newlyAssigned.length > 0) {
        const notifications = newlyAssigned.map((userId: string) => ({
          user_id: userId,
          message: `${profile.full_name} assigned you to the task "${itemToUpdate.name}".`,
          board_id: activeBoard.id,
          item_id: itemToUpdate.id,
        }));
        await supabase.from("notifications").insert(notifications);
      }
    } catch (err) {
      console.error("Failed to update cell", err);
    }
  }, []);

  const createBoard = useCallback(async (workspaceId?: string, currentProfile?: Profile | null) => {
    const boardName = await requestPrompt("Enter new board name:");
    if (!boardName) return;
    const wsId = workspaceId || (await supabase.from("workspaces").select("id").limit(1).single()).data?.id;
    const defaultColumns: Column[] = [
      { id: "status", title: "Status", type: "status" },
      { id: "date", title: "Date", type: "date" },
    ];
    try {
      const { data, error } = await supabase
        .from("boards")
        .insert({ name: boardName, description: "New project board", workspace_id: wsId, columns: defaultColumns })
        .select()
        .single();
      if (error) {
        alert("Create board error: " + JSON.stringify(error));
        throw error;
      }
      if (data) {
        if (currentProfile && (currentProfile.role === "contractor" || currentProfile.role === "member")) {
          const currentAllowed = currentProfile.allowed_boards || [];
          if (!currentAllowed.includes(data.id)) {
            await supabase.from("profiles").update({ allowed_boards: [...currentAllowed, data.id] }).eq("id", currentProfile.id);
          }
        }
        dispatch({ type: "ADD_BOARD", payload: data });
        switchBoard(data);
      }
    } catch (err) {
      console.error("Failed to create board:", err);
    }
  }, [switchBoard]);

  const renameGroup = useCallback(async (groupId: string, title: string) => {
    if (!title.trim()) {
      dispatch({ type: "SET_EDITING_GROUP", payload: { id: null, title: "" } });
      return;
    }
    dispatch({ type: "SET_GROUPS", payload: state.groups.map((g) => g.id === groupId ? { ...g, title } : g) });
    dispatch({ type: "SET_EDITING_GROUP", payload: { id: null, title: "" } });
    try {
      await supabase.from("groups").update({ title }).eq("id", groupId);
    } catch (err) {
      console.error("Failed to rename group", err);
    }
  }, [state.groups]);

  const changeGroupColor = useCallback(async (groupId: string, color: string) => {
    dispatch({ type: "SET_GROUPS", payload: state.groups.map((g) => g.id === groupId ? { ...g, color } : g) });
    try {
      await supabase.from("groups").update({ color }).eq("id", groupId);
    } catch (err) {
      console.error("Failed to change group color", err);
    }
  }, [state.groups]);

  const addItem = useCallback(async (groupId: string, name: string, activeBoard: Board, items: Item[]) => {
    if (!name.trim() || !activeBoard) return;
    const tempId = `temp-${Date.now()}`;
    const groupItems = items.filter((i) => i.group_id === groupId);
    const maxPosition = groupItems.length > 0 ? Math.max(...groupItems.map(i => i.position)) : -1;

    const newItem: Item = {
      id: tempId,
      board_id: activeBoard.id,
      group_id: groupId,
      name,
      column_values: {},
      position: maxPosition + 1,
    };
    dispatch({ type: "ADD_ITEM", payload: newItem });
    dispatch({ type: "SET_NEW_ITEM_NAME", payload: "" });
    dispatch({ type: "SET_ADDING_TO_GROUP", payload: null });
    try {
      const { data, error } = await supabase
        .from("items")
        .insert({ board_id: newItem.board_id, group_id: newItem.group_id, name: newItem.name, position: newItem.position, column_values: newItem.column_values })
        .select()
        .single();
      if (error) throw error;
      if (data) dispatch({ type: "REPLACE_TEMP_ITEM", payload: { tempId, item: data } });
    } catch {
      dispatch({ type: "REMOVE_ITEM", payload: tempId });
    }
  }, []);

  const addGroup = useCallback(async (activeBoard: Board, groups: Group[]) => {
    if (!activeBoard) return;
    const colors = ["#579bfc", "#00c875", "#e2445c", "#fdab3d", "#a25ddc", "#0086c0"];
    const tempId = `temp-group-${Date.now()}`;
    const newGroup: Group = {
      id: tempId,
      title: "New Group",
      color: colors[Math.floor(Math.random() * colors.length)],
      position: groups.length,
      board_id: activeBoard.id,
    };
    dispatch({ type: "ADD_GROUP", payload: newGroup });
    try {
      const { data, error } = await supabase
        .from("groups")
        .insert({ board_id: activeBoard.id, title: newGroup.title, color: newGroup.color, position: newGroup.position })
        .select()
        .single();
      if (error) throw error;
      if (data) dispatch({ type: "REPLACE_TEMP_GROUP", payload: { tempId, group: data } });
    } catch {
      dispatch({ type: "REMOVE_GROUP", payload: tempId });
    }
  }, []);

  const duplicateItem = useCallback(async (item: Item) => {
    dispatch({ type: "SET_ITEM_MENU_OPEN", payload: null });
    const tempId = `temp-dup-${Date.now()}`;
    const duplicate: Item = { ...item, id: tempId, name: `${item.name} (Copy)`, position: item.position + 1 };
    dispatch({ type: "ADD_ITEM", payload: duplicate });
    try {
      const { data, error } = await supabase
        .from("items")
        .insert({ board_id: duplicate.board_id, group_id: duplicate.group_id, name: duplicate.name, position: duplicate.position, column_values: duplicate.column_values })
        .select()
        .single();
      if (error) throw error;
      if (data) dispatch({ type: "REPLACE_TEMP_ITEM", payload: { tempId, item: data } });
    } catch {
      dispatch({ type: "REMOVE_ITEM", payload: tempId });
    }
  }, []);

  const renameItem = useCallback(async (item: Item, newName: string) => {
    dispatch({ type: "SET_ITEM_MENU_OPEN", payload: null });
    if (!newName || newName === item.name) return;
    
    // Optimistic update
    dispatch({ type: "UPDATE_ITEM", payload: { ...item, name: newName } });
    
    try {
      const { error } = await supabase
        .from("items")
        .update({ name: newName })
        .eq("id", item.id);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to rename item", err);
      // Revert on error
      dispatch({ type: "UPDATE_ITEM", payload: item });
    }
  }, []);

  const deleteItem = useCallback(async (itemId: string) => {
    // 1. Move to trash in state
    const itemToTrash = state.items.find(i => i.id === itemId);
    if (itemToTrash) {
      dispatch({ type: "REMOVE_ITEM", payload: itemId });
      dispatch({ type: "ADD_TRASH_ITEM", payload: { ...itemToTrash, deleted_at: new Date().toISOString() } });
    }
    
    // 2. Soft delete in DB
    try {
      await supabase.from("items").update({ deleted_at: new Date().toISOString() }).eq("id", itemId);
    } catch (err) {
      console.error("Failed to soft delete item", err);
    }
  }, [state.items]);

  const restoreItem = useCallback(async (itemId: string) => {
    // 1. Restore in state
    const itemToRestore = state.trashItems.find(i => i.id === itemId);
    if (itemToRestore) {
      dispatch({ type: "REMOVE_TRASH_ITEM", payload: itemId });
      dispatch({ type: "ADD_ITEM", payload: { ...itemToRestore, deleted_at: null } });
    }
    
    // 2. Restore in DB
    try {
      await supabase.from("items").update({ deleted_at: null }).eq("id", itemId);
    } catch (err) {
      console.error("Failed to restore item", err);
    }
  }, [state.trashItems]);

  const deleteGroup = useCallback(async (groupId: string) => {
    if (!window.confirm("Are you sure you want to delete this group?")) return;
    dispatch({ type: "REMOVE_GROUP", payload: groupId });
    try {
      await supabase.from("items").delete().eq("group_id", groupId);
      await supabase.from("groups").delete().eq("id", groupId);
    } catch (err) {
      console.error("Failed to delete group", err);
    }
  }, []);

  const renameWorkspace = useCallback(async (ws: Workspace) => {
    const newName = await requestPrompt("Enter new workspace name:", ws.name);
    if (newName && newName !== ws.name) {
      try {
        const { error } = await supabase.from("workspaces").update({ name: newName }).eq("id", ws.id);
        if (!error) dispatch({ type: "UPDATE_WORKSPACE", payload: { ...ws, name: newName } });
      } catch (err) {
        console.error("Rename failed", err);
      }
    }
  }, []);

  const deleteWorkspace = useCallback(async (ws: Workspace) => {
    if (confirm(`Are you sure you want to delete workspace "${ws.name}"?`)) {
      try {
        const { error } = await supabase.from("workspaces").delete().eq("id", ws.id);
        if (!error) dispatch({ type: "REMOVE_WORKSPACE", payload: ws.id });
      } catch (err) {
        console.error("Delete failed", err);
      }
    }
  }, []);

  const renameBoard = useCallback(async (board: Board) => {
    const newName = await requestPrompt("Enter new board name:", board.name);
    if (newName && newName !== board.name) {
      try {
        const { error } = await supabase.from("boards").update({ name: newName }).eq("id", board.id);
        if (!error) dispatch({ type: "UPDATE_BOARD", payload: { ...board, name: newName } });
      } catch (err) {
        console.error("Rename failed", err);
      }
    }
  }, []);

  const deleteBoard = useCallback(async (board: Board) => {
    if (confirm(`Are you sure you want to delete board "${board.name}"?`)) {
      try {
        const { error } = await supabase.from("boards").delete().eq("id", board.id);
        if (!error) dispatch({ type: "REMOVE_BOARD", payload: board.id });
      } catch (err) {
        console.error("Delete failed", err);
      }
    }
  }, []);

  const updateBoardItemNameColumn = useCallback(async (board: Board, newName: string) => {
    if (newName) {
      // Optimistic update
      dispatch({ type: "UPDATE_BOARD", payload: { ...board, item_name_column: newName } });
      try {
        const { error } = await supabase.from("boards").update({ item_name_column: newName }).eq("id", board.id);
        if (error) throw error;
      } catch (err) {
        console.error("Failed to rename column", err);
        dispatch({ type: "UPDATE_BOARD", payload: board }); // Revert
      }
    }
  }, []);

  const createWorkspace = useCallback(async (currentProfile?: Profile | null) => {
    const name = await requestPrompt("New Workspace Name:");
    if (name) {
      const { data, error } = await supabase.from("workspaces").insert({ name }).select().single();
      if (error) {
        alert("Create workspace error: " + JSON.stringify(error));
        console.error("Create workspace error:", error);
      }
      if (data) {
        if (currentProfile && (currentProfile.role === "contractor" || currentProfile.role === "member")) {
          const currentAllowed = currentProfile.allowed_workspaces || [];
          if (!currentAllowed.includes(data.id)) {
            await supabase.from("profiles").update({ allowed_workspaces: [...currentAllowed, data.id] }).eq("id", currentProfile.id);
          }
        }
        dispatch({ type: "ADD_WORKSPACE", payload: data });
        dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: data });
      }
    }
  }, []);

  const handleDragEnd = useCallback(async (result: any) => {
    const { destination, source, draggableId, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === "COLUMN" && state.activeBoard) {
      reorderColumns(state.activeBoard, source.index, destination.index);
      return;
    }

    const draggedItemIndex = state.items.findIndex(i => i.id === draggableId);
    if (draggedItemIndex === -1) return;
    const draggedItem = { ...state.items[draggedItemIndex] };

    // Get all items in the destination group, excluding the dragged item (if it was already in this group)
    const destGroupItems = state.items
      .filter((item) => item.group_id === destination.droppableId && item.id !== draggableId)
      .sort((a, b) => a.position - b.position);

    // Insert the dragged item into the new position in the array
    destGroupItems.splice(destination.index, 0, draggedItem);

    // Calculate new position
    let newPos = 65536;
    if (destGroupItems.length === 1) {
      newPos = 65536;
    } else if (destination.index === 0) {
      newPos = destGroupItems[1].position / 2;
    } else if (destination.index === destGroupItems.length - 1) {
      newPos = destGroupItems[destination.index - 1].position + 65536;
    } else {
      newPos = (destGroupItems[destination.index - 1].position + destGroupItems[destination.index + 1].position) / 2;
    }

    draggedItem.position = newPos;
    draggedItem.group_id = destination.droppableId;

    // Build the final items array
    const finalItems = state.items.map((item) => (item.id === draggableId ? draggedItem : item));
    dispatch({ type: "SET_ITEMS", payload: finalItems });

    try {
      await supabase.from("items").update({ group_id: destination.droppableId, position: newPos }).eq("id", draggableId);
    } catch (err) {
      console.error("Failed to move item", err);
    }
  }, [state.activeBoard, state.items, reorderColumns]);

  const addLink = useCallback(async (sourceItemId: string, targetItemId: string, linkType: "dependency" | "relation" | "subitem" = "relation") => {
    try {
      const tempId = `temp-link-${Date.now()}`;
      const newLink = { id: tempId, source_item_id: sourceItemId, target_item_id: targetItemId, link_type: linkType, created_at: new Date().toISOString() };
      dispatch({ type: "ADD_ITEM_LINK", payload: newLink });
      const { data, error } = await supabase.from("item_links").insert({ source_item_id: sourceItemId, target_item_id: targetItemId, link_type: linkType }).select().single();
      if (!error && data) {
        dispatch({ type: "REMOVE_ITEM_LINK", payload: tempId });
        dispatch({ type: "ADD_ITEM_LINK", payload: data });
      }
    } catch (err) {
      console.error("Failed to add item link", err);
    }
  }, []);

  const removeLink = useCallback(async (linkId: string) => {
    try {
      dispatch({ type: "REMOVE_ITEM_LINK", payload: linkId });
      await supabase.from("item_links").delete().eq("id", linkId);
    } catch (err) {
      console.error("Failed to remove item link", err);
    }
  }, []);

  return {
    state,
    dispatch,
    // Data fetching
    fetchWorkspaces,
    fetchProfiles,
    fetchBoards,
    fetchBoardData,
    fetchMyWorkItems,
    // Board navigation
    switchBoard,
    // Column operations
    addColumn,
    renameColumn,
    resizeColumn,
    deleteColumn,
    reorderColumns,
    // Item operations
    updateCell,
    addItem,
    deleteItem,
    restoreItem,
    duplicateItem,
    renameItem,
    // Item Link operations
    addLink,
    removeLink,
    // Board CRUD
    createBoard,
    renameBoard,
    deleteBoard,
    updateBoardItemNameColumn,
    // Group operations
    renameGroup,
    changeGroupColor,
    addGroup,
    deleteGroup,
    toggleGroupCollapse: useCallback((groupId: string) => dispatch({ type: "TOGGLE_GROUP_COLLAPSE", payload: groupId }), []),
    // Workspace operations
    renameWorkspace,
    deleteWorkspace,
    createWorkspace,
    // Drag & drop
    handleDragEnd,
    // UI Components
    PromptComponent,
  };
}
