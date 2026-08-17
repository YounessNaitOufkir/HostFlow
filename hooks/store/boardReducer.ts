import type { BoardStoreState, BoardAction } from "./types";

export const initialBoardStoreState: BoardStoreState = {
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
  organizationSettings: null,
  teams: [],
  globalStatusLabels: [],
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
  hiddenColumns: {},
};

export function boardReducer(
  state: BoardStoreState,
  action: BoardAction
): BoardStoreState {
  switch (action.type) {
    case "SET_MOUNTED":
      return { ...state, mounted: true };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_WORKSPACES":
      return {
        ...state,
        workspaces: action.payload.workspaces,
        activeWorkspace: action.payload.active,
      };
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
      return { 
        ...state, 
        activeBoard: action.payload,
        mainView: !action.payload && state.mainView === "board" ? "workspace_overview" : state.mainView
      };
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
      const nextActiveBoard = state.activeBoard?.id === action.payload
        ? updated.find(b => b.workspace_id === state.activeWorkspace?.id) || null
        : state.activeBoard;
        
      return {
        ...state,
        boards: updated,
        activeBoard: nextActiveBoard,
        mainView: !nextActiveBoard && state.mainView === "board" ? "workspace_overview" : state.mainView,
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
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.payload),
      };
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
      return {
        ...state,
        itemLinks: state.itemLinks.filter((link) => link.id !== action.payload),
      };
    case "SET_ORGANIZATION_SETTINGS":
      return { ...state, organizationSettings: action.payload };
    case "SET_TEAMS":
      return { ...state, teams: action.payload };
    case "SET_GLOBAL_STATUS_LABELS":
      return { ...state, globalStatusLabels: action.payload };
    case "SET_MAIN_VIEW":
      return { ...state, mainView: action.payload };
    case "SET_SHOW_SIDEBAR":
      return { ...state, showWorkspaceSidebar: action.payload };
    case "SET_SHOW_AUTOMATIONS":
      return { ...state, showAutomations: action.payload };
    case "SET_SHOW_ADMIN":
      return { ...state, showAdminModal: action.payload };
    case "SET_SELECTED_ITEM":
      return {
        ...state,
        selectedItem: action.payload,
        pendingSelectedItemId: null,
      };
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
      return {
        ...state,
        editingGroupId: action.payload.id,
        editGroupTitle: action.payload.title,
      };
    case "SET_ITEM_MENU_OPEN":
      return { ...state, itemMenuOpen: action.payload };
    case "SET_MY_WORK_ITEMS":
      return { ...state, myWorkItems: action.payload };
    case "SET_TRASH_ITEMS":
      return { ...state, trashItems: action.payload };
    case "ADD_TRASH_ITEM":
      return { ...state, trashItems: [...state.trashItems, action.payload] };
    case "REMOVE_TRASH_ITEM":
      return {
        ...state,
        trashItems: state.trashItems.filter((i) => i.id !== action.payload),
      };
    case "TOGGLE_GROUP_COLLAPSE":
      return {
        ...state,
        collapsedGroups: state.collapsedGroups.includes(action.payload)
          ? state.collapsedGroups.filter((id) => id !== action.payload)
          : [...state.collapsedGroups, action.payload],
      };
    case "SET_HIDDEN_COLUMNS":
      return { ...state, hiddenColumns: action.payload };
    case "TOGGLE_COLUMN_VISIBILITY": {
      const { boardId, columnId } = action.payload;
      const boardHidden = state.hiddenColumns[boardId] || [];
      const newBoardHidden = boardHidden.includes(columnId)
        ? boardHidden.filter((id) => id !== columnId)
        : [...boardHidden, columnId];

      const newHiddenColumns = {
        ...state.hiddenColumns,
        [boardId]: newBoardHidden,
      };
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "monday_clone_hidden_columns",
          JSON.stringify(newHiddenColumns)
        );
      }
      return { ...state, hiddenColumns: newHiddenColumns };
    }
    default:
      return state;
  }
}
