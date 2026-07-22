// ============================================================
// Shared TypeScript interfaces for the HostFlow platform
// ============================================================

export type UserRole = "admin" | "manager" | "member" | "contractor";
export type BoardType = "standard" | "properties" | "contractors" | "procurement" | "crm";
export type LinkType = "dependency" | "relation" | "subitem";

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
  | "checkbox"
  | "link"
  | "rating"
  | "relation";

// ============================================================
// Column Settings (per-type configuration)
// ============================================================

export interface StatusOption {
  label: string;
  color: string; // Tailwind bg class like "bg-[#fdab3d]"
}

export interface ColumnSettings {
  /** Formula expression: e.g., "{numbers_col1} * {numbers_col2}" */
  formula?: string;
  /** Cross-board formula reference */
  formulaBoardId?: string;
  /** Number formatting */
  numberFormat?: "plain" | "currency" | "percent";
  currencySymbol?: string;
  /** Custom status labels (overrides default STATUS_OPTIONS) */
  statusLabels?: StatusOption[];
  /** Default value for new items */
  defaultValue?: CellValue;
  /** Link display: "url" shows raw URL, "button" shows clickable button */
  linkDisplay?: "url" | "button";
  /** Rating max stars */
  ratingMax?: number;
}

// ============================================================
// Core Data Models
// ============================================================

export interface Column {
  id: string;
  title: string;
  type: ColumnType;
  width?: number; // Custom resizable width
  settings?: ColumnSettings;
}

/** Typed cell values */
export type CellValue =
  | string
  | number
  | boolean
  | string[] // people IDs, tags, file URLs, dependency IDs
  | { start: string; end: string } // timeline
  | { url: string; label?: string } // link
  | null;

export interface Workspace {
  id: string;
  name: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_initials: string;
  color: string;
  avatar_url?: string;
  is_onboarded?: boolean;
  role?: UserRole;
  allowed_workspaces?: string[];
  allowed_boards?: string[];
}

export interface Board {
  id: string;
  name: string;
  description: string;
  workspace_id?: string;
  columns: Column[];
  position?: number;
  type?: BoardType;
  item_name_column?: string;
  item_name_column_width?: number;
}

export interface Group {
  id: string;
  title: string;
  color: string;
  position: number;
  board_id: string;
}

export interface Item {
  id: string;
  group_id: string;
  name: string;
  /** Dynamic cell data keyed by column ID */
  column_values: Record<string, any>;
  position: number;
  board_id: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null; // For Soft Delete
}

export interface ItemLink {
  id: string;
  source_item_id: string;
  target_item_id: string;
  link_type: LinkType;
  created_at: string;
}

/** A single comment/update posted on an item */
export interface Update {
  id: string;
  item_id: string;
  parent_id?: string;
  body: string;
  author_id: string;
  author_name: string;
  created_at: string;
  deleted_at?: string | null;
}

// ============================================================
// Automation Types
// ============================================================

export type AutomationActionType =
  | "move_group"
  | "set_value"
  | "notify"
  | "create_item"
  | "update_status";

export interface Automation {
  id: string;
  board_id: string;
  trigger_column_id: string;
  trigger_value: string;
  action_type: AutomationActionType;
  action_target_id: string;
  action_payload?: Record<string, any>;
  enabled?: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  read: boolean;
  created_at: string;
  board_id?: string;
  item_id?: string;
}

export interface ActivityLog {
  id: string;
  item_id: string;
  board_id: string;
  user_id: string;
  action: string;
  created_at: string;
}

// ============================================================
// Filter & Sort Types
// ============================================================

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than"
  | "is_before"
  | "is_after";

export interface FilterRule {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value: string | number | string[];
}

export type FilterLogic = "and" | "or";

export interface SortRule {
  columnId: string;
  direction: "asc" | "desc";
}

// ============================================================
// Constants
// ============================================================

export const STATUS_OPTIONS: StatusOption[] = [
  { label: "Working on it", color: "bg-[#fdab3d]" },
  { label: "Done", color: "bg-[#00c875]" },
  { label: "Stuck", color: "bg-[#e2445c]" },
  { label: "Not Started", color: "bg-[#c4c4c4]" },
];

export const PRIORITY_OPTIONS: StatusOption[] = [
  { label: "Critical", color: "bg-gray-900" },
  { label: "High", color: "bg-[#e2445c]" },
  { label: "Medium", color: "bg-[#a25ddc]" },
  { label: "Low", color: "bg-[#579bfc]" },
  { label: "Empty", color: "bg-[#c4c4c4]" },
];

/** Group colors palette */
export const GROUP_COLORS = [
  "#579bfc", "#00c875", "#e2445c", "#fdab3d",
  "#a25ddc", "#0086c0", "#037f4c", "#bb3354",
  "#ff642e", "#cab641",
] as const;
