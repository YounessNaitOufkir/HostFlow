import { queryKeys } from "@/hooks/queries/queryKeys";

/** A change as Realtime delivers it. */
export interface LiveChange {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

/** What one change means for the screens. */
export interface LiveEffect {
  /** Query key prefixes to refresh. Only the ones on screen refetch now; the rest when next opened. */
  keys: (readonly unknown[])[];
  /** A task whose change may concern boards other than its own, or My Work. */
  itemId?: string;
  /** The task's values, to tell whether it is now assigned to you. */
  itemValues?: Record<string, unknown>;
  /** Comments changed on this task. */
  commentsOf?: string;
  /** Your own profile changed: role, Team, colour, language. */
  ownProfile?: Record<string, unknown>;
}

/** The tables the app listens to. notifications has its own, per-person listener. */
export const LIVE_TABLES = [
  "items",
  "groups",
  "item_links",
  "boards",
  "workspaces",
  "workspace_members",
  "board_members",
  "updates",
  "activity_logs",
  "audit_logs",
  "automations",
  "delay_notes",
  "access_requests",
  "profiles",
  "directory_changes",
  "board_templates",
  "organization_settings",
  "teams",
  "team_members",
] as const;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * The row a change is about. A delete carries only the id: Realtime cannot
 * check access to a row that is gone, so it sends nothing else.
 */
function rowOf(change: LiveChange): Record<string, unknown> {
  return change.eventType === "DELETE" ? change.old ?? {} : change.new ?? {};
}

/** The screens to refresh for one change. */
export function effectOf(change: LiveChange, userId: string | null | undefined): LiveEffect {
  const row = rowOf(change);
  const boardId = str(row.board_id);
  const itemId = str(row.item_id);
  // A board's data, or every cached board's when the change does not say which.
  const boardData = boardId ? queryKeys.boardData(boardId) : (["boardData"] as const);

  switch (change.table) {
    case "items":
      return {
        keys: [boardData, ["portfolio"], ["workspaceGantt"], ["itemsByIds"]],
        itemId: str(row.id),
        itemValues: (row.column_values as Record<string, unknown> | undefined) ?? undefined,
      };
    case "groups":
      return { keys: [boardData, ["workspaceGantt"], ["portfolioGroups"]] };
    case "item_links":
      // A link names two tasks, not a board.
      return { keys: [["boardData"], ["workspaceGantt"]] };
    case "boards":
      // Columns live on the board row, and My Work reads them to find your tasks.
      return { keys: [queryKeys.boards(), ["myWorkItems"]] };
    case "workspaces":
      return { keys: [queryKeys.workspaces(), queryKeys.boards()] };
    case "workspace_members":
    case "board_members":
      // Who can see what: the sidebar, the people you can assign, and admin screens.
      return {
        keys: [
          queryKeys.workspaces(),
          queryKeys.boards(),
          ["boardAccess"],
          ["canManageBoard"],
          queryKeys.profiles(),
          queryKeys.adminData(),
        ],
      };
    case "updates":
      return {
        keys: [itemId ? queryKeys.itemUpdates(itemId) : ["updates"], ["trashUpdates"]],
        // Comments are deleted by marking them, which names the task. A real
        // delete names nothing, and comes from the task itself being deleted.
        commentsOf: itemId,
      };
    case "activity_logs":
      return { keys: [itemId ? queryKeys.itemActivityLogs(itemId) : ["activityLogs"]] };
    case "audit_logs":
      return { keys: [boardId ? queryKeys.auditLogs(boardId) : ["auditLogs"]] };
    case "automations":
      return { keys: [["automations"], ["workspaceAutomations"], boardData, ["workspaceGantt"]] };
    case "delay_notes":
      return { keys: [["delayNotes"]] };
    case "access_requests":
      return { keys: [["accessRequests"]] };
    case "profiles":
      if (userId && str(row.id) === userId && change.eventType !== "DELETE") {
        return { keys: [queryKeys.profiles(), queryKeys.adminData()], ownProfile: row };
      }
      return { keys: [queryKeys.profiles(), queryKeys.adminData()] };
    case "directory_changes":
      // A colleague's name, photo or colour: everywhere names are shown.
      // profiles above only ever reports your own row; this reports theirs,
      // to the people who can see them.
      return { keys: [queryKeys.profiles(), queryKeys.adminData(), ["accessRequests"]] };
    case "board_templates":
      return { keys: [queryKeys.boardTemplates()] };
    case "organization_settings":
    case "teams":
      return { keys: [queryKeys.globalSettings()] };
    case "team_members":
      return { keys: [queryKeys.globalSettings(), queryKeys.adminData()] };
    default:
      return { keys: [] };
  }
}

/** Whether a task's values put this person in one of its people columns. */
export function assignsTo(values: Record<string, unknown> | undefined, userId: string): boolean {
  if (!values) return false;
  return Object.values(values).some((value) => {
    let v = value;
    if (typeof v === "string" && v.startsWith("[")) {
      try {
        v = JSON.parse(v);
      } catch {
        return false;
      }
    }
    return Array.isArray(v) && v.includes(userId);
  });
}

/** A stable string for a query key, to collect a burst of changes without repeats. */
export function keyId(key: readonly unknown[]): string {
  return JSON.stringify(key);
}
