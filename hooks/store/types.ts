import type {
  Board,
  Group,
  Item,
  Column,
  Workspace,
  Profile,
  Automation,
  ItemLink,
  OrganizationSettings,
  Team,
  GlobalStatusLabel,
} from "@/types";

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

  // --- Global Settings ---
  organizationSettings: OrganizationSettings | null;
  teams: Team[];
  globalStatusLabels: GlobalStatusLabel[];

  // --- UI state ---
  mainView:
    | "board"
    | "kanban"
    | "dashboard"
    | "calendar"
    | "gantt"
    | "cards"
    | "my_work"
    | "trash"
    | "workspace_overview"
    | "workspace_gantt";
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

  // --- Hidden Columns ---
  hiddenColumns: Record<string, string[]>;
}

export type BoardAction =
  | { type: "SET_MOUNTED" }
  | { type: "SET_LOADING"; payload: boolean }
  | {
      type: "SET_WORKSPACES";
      payload: { workspaces: Workspace[]; active: Workspace | null };
    }
  | { type: "SET_ACTIVE_WORKSPACE"; payload: Workspace | null }
  | { type: "UPDATE_WORKSPACE"; payload: Workspace }
  | { type: "REMOVE_WORKSPACE"; payload: string }
  | { type: "ADD_WORKSPACE"; payload: Workspace }
  | { type: "SET_BOARDS"; payload: Board[] }
  | { type: "SET_ACTIVE_BOARD"; payload: Board | null }
  | { type: "UPDATE_BOARD"; payload: Board }
  | { type: "ADD_BOARD"; payload: Board }
  | { type: "REMOVE_BOARD"; payload: string }
  | {
      type: "SET_BOARD_DATA";
      payload: {
        groups: Group[];
        items: Item[];
        automations: Automation[];
        itemLinks: ItemLink[];
      };
    }
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
  | { type: "SET_ORGANIZATION_SETTINGS"; payload: OrganizationSettings | null }
  | { type: "SET_TEAMS"; payload: Team[] }
  | { type: "SET_GLOBAL_STATUS_LABELS"; payload: GlobalStatusLabel[] }
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
  | {
      type: "SET_EDITING_GROUP";
      payload: { id: string | null; title: string };
    }
  | { type: "SET_ITEM_MENU_OPEN"; payload: string | null }
  | { type: "SET_MY_WORK_ITEMS"; payload: Item[] }
  | { type: "SET_TRASH_ITEMS"; payload: Item[] }
  | { type: "ADD_TRASH_ITEM"; payload: Item }
  | { type: "REMOVE_TRASH_ITEM"; payload: string }
  | { type: "TOGGLE_GROUP_COLLAPSE"; payload: string }
  | { type: "SET_HIDDEN_COLUMNS"; payload: Record<string, string[]> }
  | {
      type: "TOGGLE_COLUMN_VISIBILITY";
      payload: { boardId: string; columnId: string };
    };

export type BoardStoreDispatch = React.Dispatch<BoardAction>;
