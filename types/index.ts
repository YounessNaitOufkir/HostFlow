// ============================================================
// Shared TypeScript interfaces for the HostFlow PM platform
// Enterprise-grade, fully-typed data models
// ============================================================

/** Supported dynamic column types */
export type ColumnType = 
  | "status" 
  | "text" 
  | "date" 
  | "numbers" 
  | "people" 
  | "timeline" 
  | "tags" 
  | "files" 
  | "priority" 
  | "dependency"
  | "formula"
  | "link";

/** Formula operations supported */
export type FormulaOperation = 
  | "sum" 
  | "average" 
  | "count" 
  | "min" 
  | "max"
  | "custom";

/** Column configuration for type-specific settings */
export interface ColumnConfig {
  // Status column config
  statusOptions?: Array<{ label: string; color: string; icon?: string }>;
  
  // Number column config
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
  
  // Date column config
  includeTime?: boolean;
  
  // Timeline column config
  showProgress?: boolean;
  
  // Formula column config
  formulaOperation?: FormulaOperation;
  formulaSourceColumns?: string[];
  formulaExpression?: string;
  
  // Link column config
  linkedBoardId?: string;
  linkedColumnId?: string;
}

/** A single column definition stored in boards.columns JSONB array */
export interface Column {
  id: string;
  title: string;
  type: ColumnType;
  config?: ColumnConfig;
  position?: number;
}

/** Workspace - top-level organizational unit */
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  created_at?: string;
  updated_at?: string;
}

/** User profile with RBAC */
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_initials: string;
  color: string;
  role?: "admin" | "member" | "limited";
  allowed_workspaces?: string[];
  allowed_boards?: string[];
  timezone?: string;
  avatar_url?: string;
  created_at?: string;
}

/** Board - main container for items and groups */
export interface Board {
  id: string;
  name: string;
  description: string;
  workspace_id?: string;
  columns: Column[];
  icon?: string;
  color?: string;
  is_private?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Group - logical grouping within a board (like a swimlane) */
export interface Group {
  id: string;
  title: string;
  color: string;
  position: number;
  board_id: string;
  collapsed?: boolean;
  created_at?: string;
}

/** Cell value types for type-safe column_values */
export type CellValue = 
  | string                           // text, status, date, etc.
  | number                           // numbers
  | boolean                          // checkbox
  | string[]                         // people, tags, files
  | { start: string; end: string }   // timeline
  | { item_id: string }[]            // dependency
  | null;

/** Item - a single row/card in a board */
export interface Item {
  id: string;
  group_id: string;
  name: string;
  /** Dynamic cell data keyed by column ID. Values can be strings or arrays (people multi-select). */
  column_values: Record<string, CellValue>;
  position: number;
  board_id: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

/** A single comment/update posted on an item */
export interface Update {
  id: string;
  item_id: string;
  body: string;
  author_id: string;
  author_name: string;
  author_avatar?: string;
  author_color?: string;
  created_at: string;
  updated_at?: string;
}

/** Automation trigger types */
export type AutomationTriggerType = 
  | "status_changed"
  | "date_reached"
  | "assignee_added"
  | "item_created"
  | "column_updated";

/** Automation action types */
export type AutomationActionType = 
  | "move_to_group"
  | "change_status"
  | "send_notification"
  | "assign_user"
  | "set_date"
  | "send_email";

/** Automation - event-driven workflow rule */
export interface Automation {
  id: string;
  board_id: string;
  name?: string;
  enabled: boolean;
  trigger: {
    type: AutomationTriggerType;
    column_id: string;
    value?: string;
  };
  actions: Array<{
    type: AutomationActionType;
    target_id?: string;
    value?: string;
  }>;
  created_at: string;
  updated_at?: string;
}

/** Notification for user alerts */
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  read: boolean;
  link?: string;
  created_at: string;
}

/** Activity log entry for item history */
export interface ActivityLog {
  id: string;
  item_id: string;
  board_id: string;
  user_id: string;
  user_name?: string;
  action: string;
  details?: Record<string, any>;
  created_at: string;
}

/** Cross-board item reference */
export interface ItemLink {
  id: string;
  source_item_id: string;
  target_item_id: string;
  link_type: "blocks" | "blocked_by" | "relates_to" | "duplicate" | "custom";
  created_at: string;
}

/** View types for the board */
export type ViewMode = "table" | "kanban" | "dashboard" | "calendar" | "gantt" | "my_work";

/** Filter configuration */
export interface BoardFilter {
  status?: string[];
  people?: string[];
  dateRange?: { start: string; end: string };
  tags?: string[];
  search?: string;
  groups?: string[];
}

/** Sort configuration */
export interface BoardSort {
  columnId: string;
  direction: "asc" | "desc";
}

/** Dashboard widget configuration */
export interface DashboardWidget {
  id: string;
  type: "status_pie" | "group_bar" | "timeline" | "activity" | "custom";
  position: { x: number; y: number };
  size: { width: number; height: number };
  config?: Record<string, any>;
}

// ============================================================
// Constants
// ============================================================

export const STATUS_OPTIONS = [
  { label: "Working on it", color: "#fdab3d", bgClass: "bg-[#fdab3d]" },
  { label: "Done", color: "#00c875", bgClass: "bg-[#00c875]" },
  { label: "Stuck", color: "#e2445c", bgClass: "bg-[#e2445c]" },
  { label: "Empty", color: "#c4c4c4", bgClass: "bg-[#c4c4c4]" },
] as const;

export const PRIORITY_OPTIONS = [
  { label: "Critical", color: "#1a1a1a", bgClass: "bg-gray-900 dark:bg-black" },
  { label: "High", color: "#e2445c", bgClass: "bg-[#e2445c]" },
  { label: "Medium", color: "#a25ddc", bgClass: "bg-[#a25ddc]" },
  { label: "Low", color: "#579bfc", bgClass: "bg-[#579bfc]" },
  { label: "Empty", color: "#c4c4c4", bgClass: "bg-[#c4c4c4]" },
] as const;

export const COLUMN_DEFAULTS: Record<ColumnType, Partial<ColumnConfig>> = {
  status: {
    statusOptions: STATUS_OPTIONS.map(s => ({ label: s.label, color: s.color })),
  },
  numbers: {
    decimalPlaces: 2,
  },
  date: {
    includeTime: false,
  },
  timeline: {
    showProgress: true,
  },
  formula: {
    formulaOperation: "sum",
  },
} as const;

// ============================================================
// Utility Types
// ============================================================

/** Normalized entity store */
export interface Normalized<T> {
  byId: Record<string, T>;
  allIds: string[];
}

/** API response wrapper */
export interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/** Paginated response */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
