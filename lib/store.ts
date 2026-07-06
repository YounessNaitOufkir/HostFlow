// ============================================================
// Centralized State Management for HostFlow
// Normalized state store with selectors and memoized computations
// ============================================================

import { 
  Board, 
  Group, 
  Item, 
  Profile, 
  Workspace, 
  Notification, 
  Automation, 
  Update,
  ActivityLog,
  BoardFilter,
  BoardSort,
  ViewMode,
  Normalized
} from "@/types";

// ============================================================
// Store State Types
// ============================================================

export interface BoardState {
  // Entities (normalized)
  boards: Normalized<Board>;
  groups: Normalized<Group>;
  items: Normalized<Item>;
  profiles: Normalized<Profile>;
  workspaces: Normalized<Workspace>;
  notifications: Normalized<Notification>;
  automations: Normalized<Automation>;
  updates: Normalized<Update>;
  activityLogs: Normalized<ActivityLog>;
  
  // UI State
  activeBoardId: string | null;
  activeWorkspaceId: string | null;
  selectedItemId: string | null;
  viewMode: ViewMode;
  filter: BoardFilter;
  sort: BoardSort | null;
  
  // Loading states
  loading: {
    boards: boolean;
    items: boolean;
    profile: boolean;
  };
  
  // Error states
  errors: {
    boards: Error | null;
    items: Error | null;
  };
  
  // Pending operations (for optimistic updates)
  pendingOperations: Map<string, PendingOperation>;
}

export interface PendingOperation {
  id: string;
  type: "create" | "update" | "delete";
  entity: "item" | "group" | "board" | "column" | "automation";
  optimisticData: any;
  timestamp: number;
}

// ============================================================
// Initial State
// ============================================================

const initialState: BoardState = {
  boards: { byId: {}, allIds: [] },
  groups: { byId: {}, allIds: [] },
  items: { byId: {}, allIds: [] },
  profiles: { byId: {}, allIds: [] },
  workspaces: { byId: {}, allIds: [] },
  notifications: { byId: {}, allIds: [] },
  automations: { byId: {}, allIds: [] },
  updates: { byId: {}, allIds: [] },
  activityLogs: { byId: {}, allIds: [] },
  
  activeBoardId: null,
  activeWorkspaceId: null,
  selectedItemId: null,
  viewMode: "table",
  filter: {},
  sort: null,
  
  loading: {
    boards: false,
    items: false,
    profile: false,
  },
  
  errors: {
    boards: null,
    items: null,
  },
  
  pendingOperations: new Map(),
};

// ============================================================
// Action Types
// ============================================================

export type BoardAction =
  | { type: "SET_BOARDS"; payload: Board[] }
  | { type: "ADD_BOARD"; payload: Board }
  | { type: "UPDATE_BOARD"; payload: Board }
  | { type: "DELETE_BOARD"; payload: string }
  | { type: "SET_ACTIVE_BOARD"; payload: string | null }
  | { type: "SET_GROUPS"; payload: Group[] }
  | { type: "ADD_GROUP"; payload: Group }
  | { type: "UPDATE_GROUP"; payload: Group }
  | { type: "DELETE_GROUP"; payload: string }
  | { type: "SET_ITEMS"; payload: Item[] }
  | { type: "ADD_ITEM"; payload: Item }
  | { type: "UPDATE_ITEM"; payload: Item }
  | { type: "DELETE_ITEM"; payload: string }
  | { type: "SET_SELECTED_ITEM"; payload: string | null }
  | { type: "SET_PROFILES"; payload: Profile[] }
  | { type: "UPDATE_PROFILE"; payload: Profile }
  | { type: "SET_WORKSPACES"; payload: Workspace[] }
  | { type: "SET_ACTIVE_WORKSPACE"; payload: string | null }
  | { type: "SET_VIEW_MODE"; payload: ViewMode }
  | { type: "SET_FILTER"; payload: BoardFilter }
  | { type: "SET_SORT"; payload: BoardSort | null }
  | { type: "SET_LOADING"; payload: { key: keyof BoardState["loading"]; value: boolean } }
  | { type: "SET_ERROR"; payload: { key: keyof BoardState["errors"]; error: Error | null } }
  | { type: "SET_NOTIFICATIONS"; payload: Notification[] }
  | { type: "ADD_NOTIFICATION"; payload: Notification }
  | { type: "MARK_NOTIFICATION_READ"; payload: string }
  | { type: "SET_AUTOMATIONS"; payload: Automation[] }
  | { type: "ADD_AUTOMATION"; payload: Automation }
  | { type: "UPDATE_AUTOMATION"; payload: Automation }
  | { type: "DELETE_AUTOMATION"; payload: string }
  | { type: "SET_UPDATES"; payload: Update[] }
  | { type: "ADD_UPDATE"; payload: Update }
  | { type: "SET_ACTIVITY_LOGS"; payload: ActivityLog[] }
  | { type: "ADD_ACTIVITY_LOG"; payload: ActivityLog }
  | { type: "OPTIMISTIC_UPDATE"; payload: PendingOperation }
  | { type: "CONFIRM_OPERATION"; payload: string }
  | { type: "ROLLBACK_OPERATION"; payload: string };

// ============================================================
// Normalization Helpers
// ============================================================

function normalizeEntities<T extends { id: string }>(items: T[]): Normalized<T> {
  return items.reduce(
    (acc, item) => {
      acc.byId[item.id] = item;
      acc.allIds.push(item.id);
      return acc;
    },
    { byId: {} as Record<string, T>, allIds: [] as string[] }
  );
}

// ============================================================
// Reducer
// ============================================================

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "SET_BOARDS":
      return {
        ...state,
        boards: normalizeEntities(action.payload),
      };
    
    case "ADD_BOARD":
      return {
        ...state,
        boards: {
          byId: { ...state.boards.byId, [action.payload.id]: action.payload },
          allIds: [...state.boards.allIds, action.payload.id],
        },
      };
    
    case "UPDATE_BOARD":
      return {
        ...state,
        boards: {
          ...state.boards,
          byId: { ...state.boards.byId, [action.payload.id]: action.payload },
        },
      };
    
    case "DELETE_BOARD":
      const { [action.payload]: _, ...remainingBoards } = state.boards.byId;
      return {
        ...state,
        boards: {
          byId: remainingBoards,
          allIds: state.boards.allIds.filter((id) => id !== action.payload),
        },
      };
    
    case "SET_ACTIVE_BOARD":
      return { ...state, activeBoardId: action.payload };
    
    case "SET_GROUPS":
      return {
        ...state,
        groups: normalizeEntities(action.payload),
      };
    
    case "ADD_GROUP":
      return {
        ...state,
        groups: {
          byId: { ...state.groups.byId, [action.payload.id]: action.payload },
          allIds: [...state.groups.allIds, action.payload.id],
        },
      };
    
    case "UPDATE_GROUP":
      return {
        ...state,
        groups: {
          ...state.groups,
          byId: { ...state.groups.byId, [action.payload.id]: action.payload },
        },
      };
    
    case "DELETE_GROUP":
      const { [action.payload]: __, ...remainingGroups } = state.groups.byId;
      return {
        ...state,
        groups: {
          byId: remainingGroups,
          allIds: state.groups.allIds.filter((id) => id !== action.payload),
        },
      };
    
    case "SET_ITEMS":
      return {
        ...state,
        items: normalizeEntities(action.payload),
      };
    
    case "ADD_ITEM":
      return {
        ...state,
        items: {
          byId: { ...state.items.byId, [action.payload.id]: action.payload },
          allIds: [...state.items.allIds, action.payload.id],
        },
      };
    
    case "UPDATE_ITEM":
      return {
        ...state,
        items: {
          ...state.items,
          byId: { ...state.items.byId, [action.payload.id]: action.payload },
        },
      };
    
    case "DELETE_ITEM":
      const { [action.payload]: ___, ....remainingItems } = state.items.byId;
      return {
        ...state,
        items: {
          byId: remainingItems,
          allIds: state.items.allIds.filter((id) => id !== action.payload),
        },
        selectedItemId: state.selectedItemId === action.payload ? null : state.selectedItemId,
      };
    
    case "SET_SELECTED_ITEM":
      return { ...state, selectedItemId: action.payload };
    
    case "SET_PROFILES":
      return {
        ...state,
        profiles: normalizeEntities(action.payload),
      };
    
    case "UPDATE_PROFILE":
      return {
        ...state,
        profiles: {
          ...state.profiles,
          byId: { ...state.profiles.byId, [action.payload.id]: action.payload },
        },
      };
    
    case "SET_WORKSPACES":
      return {
        ...state,
        workspaces: normalizeEntities(action.payload),
      };
    
    case "SET_ACTIVE_WORKSPACE":
      return { ...state, activeWorkspaceId: action.payload };
    
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.payload };
    
    case "SET_FILTER":
      return { ...state, filter: action.payload };
    
    case "SET_SORT":
      return { ...state, sort: action.payload };
    
    case "SET_LOADING":
      return {
        ...state,
        loading: { ...state.loading, [action.payload.key]: action.payload.value },
      };
    
    case "SET_ERROR":
      return {
        ...state,
        errors: { ...state.errors, [action.payload.key]: action.payload.error },
      };
    
    case "SET_NOTIFICATIONS":
      return {
        ...state,
        notifications: normalizeEntities(action.payload),
      };
    
    case "ADD_NOTIFICATION":
      return {
        ...state,
        notifications: {
          byId: { ...state.notifications.byId, [action.payload.id]: action.payload },
          allIds: [action.payload.id, ...state.notifications.allIds],
        },
      };
    
    case "MARK_NOTIFICATION_READ":
      return {
        ...state,
        notifications: {
          ...state.notifications,
          byId: {
            ...state.notifications.byId,
            [action.payload]: { ...state.notifications.byId[action.payload], read: true },
          },
        },
      };
    
    case "SET_AUTOMATIONS":
      return {
        ...state,
        automations: normalizeEntities(action.payload),
      };
    
    case "ADD_AUTOMATION":
      return {
        ...state,
        automations: {
          byId: { ...state.automations.byId, [action.payload.id]: action.payload },
          allIds: [...state.automations.allIds, action.payload.id],
        },
      };
    
    case "UPDATE_AUTOMATION":
      return {
        ...state,
        automations: {
          ...state.automations,
          byId: { ...state.automations.byId, [action.payload.id]: action.payload },
        },
      };
    
    case "DELETE_AUTOMATION":
      const { [action.payload]: ____, ...remainingAutomations } = state.automations.byId;
      return {
        ...state,
        automations: {
          byId: remainingAutomations,
          allIds: state.automations.allIds.filter((id) => id !== action.payload),
        },
      };
    
    case "SET_UPDATES":
      return {
        ...state,
        updates: normalizeEntities(action.payload),
      };
    
    case "ADD_UPDATE":
      return {
        ...state,
        updates: {
          byId: { ...state.updates.byId, [action.payload.id]: action.payload },
          allIds: [action.payload.id, ...state.updates.allIds],
        },
      };
    
    case "SET_ACTIVITY_LOGS":
      return {
        ...state,
        activityLogs: normalizeEntities(action.payload),
      };
    
    case "ADD_ACTIVITY_LOG":
      return {
        ...state,
        activityLogs: {
          byId: { ...state.activityLogs.byId, [action.payload.id]: action.payload },
          allIds: [action.payload.id, ...state.activityLogs.allIds],
        },
      };
    
    case "OPTIMISTIC_UPDATE":
      const newPending = new Map(state.pendingOperations);
      newPending.set(action.payload.id, action.payload);
      return { ...state, pendingOperations: newPending };
    
    case "CONFIRM_OPERATION":
      const confirmed = new Map(state.pendingOperations);
      confirmed.delete(action.payload);
      return { ...state, pendingOperations: confirmed };
    
    case "ROLLBACK_OPERATION":
      const rolledBack = new Map(state.pendingOperations);
      rolledBack.delete(action.payload);
      return { ...state, pendingOperations: rolledBack };
    
    default:
      return state;
  }
}

// ============================================================
// Selectors (memoized via useMemo in components)
// ============================================================

export const selectBoards = (state: BoardState) => 
  state.boards.allIds.map((id) => state.boards.byId[id]);

export const selectActiveBoard = (state: BoardState) =>
  state.activeBoardId ? state.boards.byId[state.activeBoardId] : null;

export const selectGroupsByBoardId = (state: BoardState, boardId: string) =>
  state.groups.allIds
    .map((id) => state.groups.byId[id])
    .filter((g) => g.board_id === boardId)
    .sort((a, b) => a.position - b.position);

export const selectItemsByBoardId = (state: BoardState, boardId: string) =>
  state.items.allIds
    .map((id) => state.items.byId[id])
    .filter((i) => i.board_id === boardId);

export const selectItemsByGroupId = (state: BoardState, groupId: string) =>
  state.items.allIds
    .map((id) => state.items.byId[id])
    .filter((i) => i.group_id === groupId)
    .sort((a, b) => a.position - b.position);

export const selectSelectedItem = (state: BoardState) =>
  state.selectedItemId ? state.items.byId[state.selectedItemId] : null;

export const selectProfiles = (state: BoardState) =>
  state.profiles.allIds.map((id) => state.profiles.byId[id]);

export const selectProfileById = (state: BoardState, id: string) =>
  state.profiles.byId[id] || null;

export const selectWorkspaces = (state: BoardState) =>
  state.workspaces.allIds.map((id) => state.workspaces.byId[id]);

export const selectActiveWorkspace = (state: BoardState) =>
  state.activeWorkspaceId ? state.workspaces.byId[state.activeWorkspaceId] : null;

export const selectNotifications = (state: BoardState) =>
  state.notifications.allIds.map((id) => state.notifications.byId[id]);

export const selectUnreadNotificationCount = (state: BoardState) =>
  state.notifications.allIds.filter((id) => !state.notifications.byId[id].read).length;

export const selectAutomationsByBoardId = (state: BoardState, boardId: string) =>
  state.automations.allIds
    .map((id) => state.automations.byId[id])
    .filter((a) => a.board_id === boardId && a.enabled);

export const selectUpdatesByItemId = (state: BoardState, itemId: string) =>
  state.updates.allIds
    .map((id) => state.updates.byId[id])
    .filter((u) => u.item_id === itemId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

export const selectActivityLogsByItemId = (state: BoardState, itemId: string) =>
  state.activityLogs.allIds
    .map((id) => state.activityLogs.byId[id])
    .filter((l) => l.item_id === itemId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

// ============================================================
// Filter & Sort Helpers
// ============================================================

export function filterItems(
  items: Item[],
  filter: BoardFilter,
  columns: Board[]
): Item[] {
  return items.filter((item) => {
    // Status filter
    if (filter.status && filter.status.length > 0) {
      const statusCol = columns.find((c) => c.type === "status");
      if (statusCol) {
        const statusVal = item.column_values[statusCol.id];
        if (!filter.status.includes(statusVal)) return false;
      }
    }
    
    // People filter
    if (filter.people && filter.people.length > 0) {
      const peopleCol = columns.find((c) => c.type === "people");
      if (peopleCol) {
        const peopleVal = item.column_values[peopleCol.id] as string[];
        if (!peopleVal || !filter.people.some((p) => peopleVal.includes(p))) return false;
      }
    }
    
    // Tags filter
    if (filter.tags && filter.tags.length > 0) {
      const tagsCol = columns.find((c) => c.type === "tags");
      if (tagsCol) {
        const tagsVal = item.column_values[tagsCol.id] as string[];
        if (!tagsVal || !filter.tags.some((t) => tagsVal.includes(t))) return false;
      }
    }
    
    // Search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      if (!item.name.toLowerCase().includes(searchLower)) return false;
    }
    
    // Groups filter
    if (filter.groups && filter.groups.length > 0) {
      if (!filter.groups.includes(item.group_id)) return false;
    }
    
    return true;
  });
}

export function sortItems(items: Item[], sort: BoardSort | null): Item[] {
  if (!sort) return items;
  
  return [...items].sort((a, b) => {
    const aVal = a.column_values[sort.columnId];
    const bVal = b.column_values[sort.columnId];
    
    // Handle null/undefined
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    
    // Compare based on type
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
    }
    
    const aStr = String(aVal);
    const bStr = String(bVal);
    return sort.direction === "asc" 
      ? aStr.localeCompare(bStr) 
      : bStr.localeCompare(aStr);
  });
}

// Export initial state for creating store
export { initialState };
