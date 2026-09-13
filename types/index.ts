import type { Locale, TranslationKey } from "@/lib/i18n";
// ============================================================
// Shared TypeScript interfaces for the HostFlow platform
// ============================================================

/**
 * `manager` and `contractor` are retired: 20260818000000 migrated every such row
 * to `member`. They survive in the Postgres enum only because removing a value is
 * disruptive — nothing assigns them, and the admin UI offers just these two.
 */
export type UserRole = "admin" | "member";
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

/**
 * What a status MEANS, as opposed to what it is called.
 *
 * Everything that has to reason about progress - the overdue rule, the daily
 * digest, the dashboard - needs to know whether a label stands for finished
 * work. Until this existed the only way to ask was to match the label against
 * a regex of human words, which is a guess: it read "Not done" as finished and
 * did not recognise "Clôturé" at all.
 */
export type StatusSemantic = "done" | "working" | "stuck" | "idle";

export interface StatusOption {
  label: string;
  color: string; // Tailwind bg class like "bg-[#fdab3d]"
  /**
   * Declared meaning. Optional: a board that has never said what its labels
   * mean falls back to matching the words, which is why the fallback still
   * exists. Set it and the guessing stops.
   */
  semantic?: StatusSemantic;
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
  /** Custom priority labels (overrides default PRIORITY_OPTIONS) */
  priorityLabels?: StatusOption[];
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
  icon?: string | null;
  created_at: string;
  is_private?: boolean;
  /** Creator of the workspace. Owns it outright when it is private. */
  created_by?: string | null;
}

/** An email invite not yet redeemed — see supabase/migrations/20260909000000_pending_invitations.sql. */
export interface PendingInvitation {
  id: string;
  workspace_id: string;
  email: string;
  invited_by: string | null;
  role: UserRole;
  is_staff_invite: boolean;
  token: string;
  created_at: string;
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
  /** Exactly one profile carries this. Cannot be demoted. */
  is_owner?: boolean;
  /** Company member: sees every shared workspace without being invited. */
  is_staff?: boolean;
  allowed_boards?: string[];
  telegram_chat_id?: string | null;
  telegram_notifications_enabled?: boolean;
  email_notifications_enabled?: boolean;
  daily_digest_enabled?: boolean;
  /** Which single channel the daily digest goes to. See lib/digestChannel.ts. */
  digest_channel?: "email" | "telegram";
  in_app_alerts_enabled?: boolean;
  /** Interface language, mirrored from the browser so the cron can match it. */
  language?: Locale;
}

/** Timeline granularity of a Gantt chart. */
export type GanttZoom = "day" | "week" | "month";

/**
 * Per-board Gantt settings.
 *
 * Without these the chart has to guess which column holds the dates it should
 * plot, and it guesses per item — so a board with two date columns plots some
 * bars from one and some from the other. Declaring the choice once makes a
 * board's chart deterministic, and lets the Master Gantt resolve every item
 * against its own board rather than a merged pile of every board's columns.
 */
export interface GanttConfig {
  /** The date or timeline column that positions a bar. */
  timelineColumnId?: string;
  /** A checkbox column marking an item as a milestone. */
  milestoneColumnId?: string;
  /** The status column that colours a bar when colouring by status. */
  statusColumnId?: string;
  defaultZoom?: GanttZoom;
  /** Which fields the left-hand task table shows, in order. */
  leftColumns?: string[];
  showBaseline?: boolean;
  showCriticalPath?: boolean;
}

export interface Board {
  id: string;
  name: string;
  description: string;
  workspace_id?: string;
  /** NULL means "inherit from the workspace" — see boards.is_private in ACCESS_MODEL.md. */
  is_private?: boolean | null;
  created_by?: string | null;
  columns: Column[];
  items?: Item[];
  automations?: Automation[];
  position?: number;
  type?: BoardType;
  item_name_column?: string;
  item_name_column_width?: number;
  gantt_config?: GanttConfig | null;
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
  /** Set when a baseline has been captured for this item. */
  baseline?: ItemBaseline | null;
}

/**
 * How two tasks are tied together. Finish-to-start is the common case and the
 * only one the chart used to assume; the other three are ordinary in real
 * plans — two surveys that run together, two approvals that must land the same
 * day — and a plan that cannot express them has to fake them with dates.
 */
export type DependencyType = "FS" | "SS" | "FF";

export interface ItemLink {
  id: string;
  source_item_id: string;
  target_item_id: string;
  link_type: LinkType;
  /** Only meaningful for `dependency` links. Absent on rows written before types existed; treat as "FS". */
  dep_type?: DependencyType;
  /** Days of delay (positive) or overlap (negative) on the dependency. */
  lag_days?: number;
  created_at: string;
}

/** The plan as it was agreed, so the chart can show drift from it. */
export interface ItemBaseline {
  start: string;
  end: string;
  captured_at: string;
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
  | "update_status"
  | "sla_alert"
  | "overdue_tagging"
  | "timeline_shifting";

export interface Automation {
  id: string;
  /** Set when the rule applies to one board only (e.g. move_group). */
  board_id?: string | null;
  /** Set when the rule applies to every board in the workspace. */
  workspace_id?: string | null;
  trigger_column_id: string;
  trigger_value: string;
  action_type: AutomationActionType;
  config?: any;
  action_target_id: string;
  action_payload?: Record<string, any>;
  enabled?: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  /**
   * The sentence as it was rendered when written. Still the fallback, and all
   * that rows written before notifications became translatable have.
   */
  message: string;
  /**
   * The sentence as a key, rendered in the READER's language when they open
   * the bell. Absent on older rows.
   */
  message_key?: TranslationKey | null;
  /** Values interpolated into `message_key`. User data: rendered as text. */
  message_vars?: Record<string, string> | null;
  read: boolean;
  created_at: string;
  board_id?: string;
  item_id?: string;
  /** The account this notification is ABOUT (a signup, an access request), not who receives it. */
  related_user_id?: string | null;
}

export interface ActivityLog {
  id: string;
  item_id: string;
  board_id: string;
  user_id: string;
  action: string;
  created_at: string;
}

/**
 * Admin-only oversight trail — distinct from `ActivityLog` above, which is the
 * board-member-visible "Updates" feed. See supabase/migrations/20260908000000_create_audit_log.sql.
 */
export type AuditActionType =
  | "item_created"
  | "item_deleted"
  | "item_restored"
  | "status_changed"
  | "assignee_changed"
  | "priority_changed"
  | "due_date_changed"
  | "description_changed"
  | "name_changed";

export interface AuditLog {
  id: string;
  board_id: string;
  item_id: string | null;
  user_id: string | null;
  action_type: AuditActionType;
  /** Shape is { name } for item_created/deleted/restored, { column, value } for a field change. */
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  created_at: string;
  /** The item's name captured by the trigger at write time, so the trail
   * still reads correctly after the item is purged. */
  item_name_snapshot: string | null;
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
  | "is_after"
  | "is_between"
  | "is_checked"
  | "is_not_checked";

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
  { label: "Working on it", color: "bg-[#fdab3d]", semantic: "working" },
  { label: "Done", color: "bg-[#00c875]", semantic: "done" },
  { label: "Stuck", color: "bg-[#e2445c]", semantic: "stuck" },
  { label: "Not Started", color: "bg-[#c4c4c4]", semantic: "idle" },
  { label: "Overdue", color: "bg-gradient-to-r from-red-600 to-rose-600", semantic: "stuck" },
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

// ============================================================
// Comprehensive Settings Features
// ============================================================

export interface OrganizationSettings {
  id: string;
  company_name: string;
  logo_url: string | null;
  primary_color: string;
  default_timezone: string;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  created_at?: string;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  created_at?: string;
}

export interface Webhook {
  id: string;
  board_id: string | null;
  endpoint_url: string;
  events: string[];
  created_at?: string;
}

export interface NotificationPreference {
  user_id: string;
  email_notifications: boolean;
  in_app_notifications: boolean;
  daily_digest: boolean;
}

