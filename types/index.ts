// ============================================================
// Shared TypeScript interfaces for the Host'Lik PM platform
// ============================================================

/** Supported dynamic column types */
export type ColumnType = "status" | "text" | "date" | "numbers" | "people" | "timeline" | "tags" | "files" | "priority" | "dependency";

/** A single column definition stored in boards.columns JSONB array */
export interface Column {
  id: string;
  title: string;
  type: ColumnType;
}

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
  role?: "admin" | "member" | "limited";
  allowed_workspaces?: string[];
  allowed_boards?: string[];
}

export interface Board {
  id: string;
  name: string;
  description: string;
  workspace_id?: string;
  columns: Column[];
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
  /** Dynamic cell data keyed by column ID. Values can be strings or arrays (people multi-select). */
  column_values: Record<string, any>;
  position: number;
  board_id: string;
}

/** A single comment/update posted on an item */
export interface Update {
  id: string;
  item_id: string;
  body: string;
  author_id: string;
  author_name: string;
  created_at: string;
}

export interface Automation {
  id: string;
  board_id: string;
  trigger_column_id: string;
  trigger_value: string;
  action_type: string;
  action_target_id: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  read: boolean;
  created_at: string;
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
// Constants
// ============================================================

export const STATUS_OPTIONS = [
  { label: "Working on it", color: "bg-[#fdab3d]" },
  { label: "Done", color: "bg-[#00c875]" },
  { label: "Stuck", color: "bg-[#e2445c]" },
  { label: "Empty", color: "bg-[#c4c4c4]" },
] as const;
