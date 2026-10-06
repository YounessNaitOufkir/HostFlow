import type { SupabaseClient } from "@supabase/supabase-js";
import type { Automation, Board, Group, Item, Workspace } from "@/types";
import { fetchAllRows } from "@/lib/supabasePaging";
import { todayInTimezone } from "@/lib/orgTime";
import { withCellDefaults } from "@/lib/cellDefaults";
import { applyDoneLink, statusColumnOf } from "@/lib/doneLink";
import { evaluateEventAutomations } from "@/lib/automations/eventRules";
import { resolveMoveTargetGroup } from "@/lib/automations/moveTarget";
import { parseDateOnly } from "@/lib/gantt/dates";
import { escapeHtml } from "@/lib/escapeHtml";
import { sendTelegramAlert } from "@/lib/telegramAlerts";
import { hasBoardAccess } from "@/lib/boardAccess";
import type { DelayNote } from "@/lib/delays";
import {
  boardLabel,
  normalizeName,
  resolveBoard,
  resolveGroup,
  resolvePerson,
  resolveStatusLabel,
  splitBoardReference,
  type DirectoryPerson,
  type Resolution,
} from "@/lib/agent/resolve";
import { delays, myTasks, summarizeTask, type DelaySummary, type TaskRange, type TaskSummary } from "@/lib/agent/reads";

/**
 * The connector's operations, run as the signed-in person.
 *
 * `supabase` is always a client built from the person's own bearer token, never
 * the service role, so row-level security answers every read and write exactly
 * as it does in the app - and the database's AI gate applies on top.
 *
 * Every write is confirmed by the row it returns. An RLS-refused UPDATE comes
 * back with no error and no rows; "no error" is not "it happened".
 */

/** A sentence for the person, relayed by Claude as-is. */
export class AgentError extends Error {
  constructor(message: string, readonly options: string[] = []) {
    super(message);
    this.name = "AgentError";
  }
}

/** A database error, turned into something worth saying. */
function fail(error: { message?: string; code?: string; hint?: string } | null, doing: string): never {
  // The AI gate (public.agent_request_gate) writes its refusals for the person.
  if (error?.hint === "hostflow-ai-gate" && error.message) throw new AgentError(error.message);
  // Row-level security says no in its own words; say it in ours.
  if (error?.code === "42501") throw new AgentError(`You don't have permission to ${doing}. Nothing was changed.`);
  console.error(`[agent] ${doing} failed:`, error);
  throw new AgentError(`Could not ${doing}. Nothing was changed.`);
}

function settle<T>(resolution: Resolution<T>, what: string, asked: string): T {
  if (resolution.kind === "one") return resolution.value;
  if (resolution.kind === "many") {
    throw new AgentError(`More than one ${what} matches "${asked}". Ask which one.`, resolution.options);
  }
  throw new AgentError(
    `No ${what} matches "${asked}".${resolution.options.length ? " These exist:" : ""}`,
    resolution.options
  );
}

export interface AgentContext {
  supabase: SupabaseClient;
  userId: string;
  fullName: string;
  today: string;
  workspaces: Workspace[];
  boards: Board[];
}

/** Who is asking, what they can see, and what day it is for the company. */
export async function loadContext(supabase: SupabaseClient, userId: string): Promise<AgentContext> {
  const [profile, workspaces, boards, settings] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("id", userId).maybeSingle(),
    fetchAllRows<Workspace>((from, to) =>
      supabase.from("workspaces").select("*").order("id").range(from, to)
    ),
    fetchAllRows<Board>((from, to) => supabase.from("boards").select("*").order("id").range(from, to)),
    supabase.from("organization_settings").select("default_timezone").limit(1).maybeSingle(),
  ]);
  if (profile.error) fail(profile.error, "read your profile");

  return {
    supabase,
    userId,
    fullName: profile.data?.full_name || "Someone",
    today: todayInTimezone(settings.data?.default_timezone ?? null),
    workspaces,
    boards,
  };
}

/** Every live item on the given boards (or every board the person can see). */
async function loadItems(ctx: AgentContext, boardIds?: string[]): Promise<Item[]> {
  return fetchAllRows<Item>((from, to) => {
    let query = ctx.supabase.from("items").select("*").is("deleted_at", null).order("id");
    if (boardIds) query = query.in("board_id", boardIds);
    return query.range(from, to);
  });
}

async function loadDirectory(ctx: AgentContext): Promise<DirectoryPerson[]> {
  const { data, error } = await ctx.supabase.from("user_directory").select("id, full_name, role, is_staff");
  if (error) fail(error, "read the people list");
  return (data ?? []) as DirectoryPerson[];
}

// ─── Reads ──────────────────────────────────────────────────────

export async function getMyTasks(ctx: AgentContext, range: TaskRange): Promise<TaskSummary[]> {
  const items = await loadItems(ctx);
  return myTasks(items, ctx.boards, ctx.workspaces, ctx.userId, ctx.today, range);
}

/** Boards in a workspace, or one board, or everything - for the delays scope. */
export function scopeBoards(ctx: AgentContext, scope: { workspace?: string | null; board?: string | null }): Board[] {
  if (scope.board) {
    return [findBoard(ctx, scope.board, scope.workspace)];
  }
  if (scope.workspace) {
    const resolution = resolveBoardWorkspace(ctx, scope.workspace);
    return ctx.boards.filter((b) => b.workspace_id === resolution.id);
  }
  return ctx.boards;
}

function resolveBoardWorkspace(ctx: AgentContext, name: string): Workspace {
  const q = normalizeName(name);
  const exact = ctx.workspaces.filter((w) => normalizeName(w.name) === q);
  const matches = exact.length ? exact : ctx.workspaces.filter((w) => normalizeName(w.name).includes(q));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new AgentError(`More than one workspace matches "${name}". Ask which one.`, matches.map((w) => w.name));
  }
  throw new AgentError(`No workspace matches "${name}".`, ctx.workspaces.map((w) => w.name).sort().slice(0, 30));
}

export async function getDelays(
  ctx: AgentContext,
  scope: { workspace?: string | null; board?: string | null }
): Promise<DelaySummary[]> {
  const boards = scopeBoards(ctx, scope);
  if (boards.length === 0) return [];
  const boardIds = boards.map((b) => b.id);

  const [items, notes, directory] = await Promise.all([
    loadItems(ctx, boardIds),
    fetchAllRows<DelayNote>((from, to) =>
      ctx.supabase.from("delay_notes").select("*").in("board_id", boardIds).order("id").range(from, to)
    ),
    loadDirectory(ctx),
  ]);
  const names = new Map(directory.map((p) => [p.id, p.full_name]));
  return delays(items, boards, ctx.workspaces, notes, names, ctx.today);
}

export interface FindResult {
  workspaces: string[];
  boards: string[];
  tasks: TaskSummary[];
}

export async function find(ctx: AgentContext, query: string): Promise<FindResult> {
  const q = query.trim();
  if (!q) throw new AgentError("Say what to look for.");
  const lower = q.toLowerCase();

  // Task names are searched in the database; % and _ are escaped so a name
  // with them is matched literally.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await ctx.supabase
    .from("items")
    .select("*")
    .is("deleted_at", null)
    .ilike("name", pattern)
    .limit(25);
  if (error) fail(error, "search tasks");

  const boardById = new Map(ctx.boards.map((b) => [b.id, b]));
  const tasks = ((data ?? []) as Item[])
    .filter((item) => boardById.has(item.board_id))
    .map((item) => {
      const board = boardById.get(item.board_id)!;
      return summarizeTask(item, board, ctx.workspaces, ctx.today);
    });

  return {
    workspaces: ctx.workspaces.filter((w) => w.name.toLowerCase().includes(lower)).map((w) => w.name),
    boards: ctx.boards
      .filter((b) => b.name.toLowerCase().includes(lower))
      .map((b) => boardLabel(b, ctx.workspaces))
      .sort(),
    tasks,
  };
}

// ─── Writes ─────────────────────────────────────────────────────

function findBoard(ctx: AgentContext, board: string, workspace?: string | null): Board {
  if (workspace) {
    return settle(resolveBoard({ workspace, board }, ctx.boards, ctx.workspaces), "board", `${workspace} › ${board}`);
  }
  // "App C › Lancement" in one string, or a bare board name.
  const split = splitBoardReference(board);
  const first = resolveBoard(split, ctx.boards, ctx.workspaces);
  if (first.kind === "none" && split.workspace) {
    return settle(resolveBoard({ board }, ctx.boards, ctx.workspaces), "board", board);
  }
  return settle(first, "board", board);
}

async function loadItem(ctx: AgentContext, taskId: string): Promise<{ item: Item; board: Board }> {
  const { data, error } = await ctx.supabase.from("items").select("*").eq("id", taskId).maybeSingle();
  if (error) fail(error, "read the task");
  const item = data as Item | null;
  // Not found and not visible look the same on purpose: RLS hides both.
  if (!item) throw new AgentError("That task was not found. Search for it first.");
  if (item.deleted_at) throw new AgentError(`"${item.name}" is in the trash.`);
  const board = ctx.boards.find((b) => b.id === item.board_id);
  if (!board) throw new AgentError("That task's board is not available.");
  return { item, board };
}

async function logActivity(ctx: AgentContext, item: Item, action: string): Promise<void> {
  const { error } = await ctx.supabase
    .from("activity_logs")
    .insert({ item_id: item.id, board_id: item.board_id, user_id: ctx.userId, action });
  // The change itself landed; a lost history line is reported, not fatal.
  if (error) console.error("[agent] activity log write failed:", error);
}

/** In-app and Telegram, exactly as assigning someone in the table does. */
async function notifyAssigned(ctx: AgentContext, item: Item, board: Board, userIds: string[]): Promise<void> {
  const recipients = userIds.filter((id) => id !== ctx.userId);
  if (recipients.length === 0) return;

  const { error } = await ctx.supabase.rpc("notify_users_i18n", {
    recipient_ids: recipients,
    message_key: "notif.assignedToTask",
    message_vars: { actor: ctx.fullName, item: item.name },
    fallback: `${ctx.fullName} assigned you to the task "${item.name}".`,
    board_id: board.id,
    item_id: item.id,
  });
  if (error) console.error("[agent] assignment notification failed:", error);

  const telegram = await sendTelegramAlert(ctx.supabase, recipients, "assignment", {
    actor: ctx.fullName,
    item: item.name,
  });
  if (!telegram.ok) console.error("[agent] assignment Telegram alert failed:", telegram.reason);
}

export interface CreateTaskInput {
  board: string;
  workspace?: string | null;
  name: string;
  group?: string | null;
  start?: string | null;
  end?: string | null;
  assignee?: string | null;
  status?: string | null;
}

export interface CreatedTask {
  task: TaskSummary;
  group: string;
  /** Things asked for that this board cannot hold, said plainly. */
  notes: string[];
}

function checkDate(value: string | null | undefined, label: string): string | null {
  if (!value) return null;
  const parsed = parseDateOnly(value);
  if (!parsed) throw new AgentError(`The ${label} date "${value}" is not a date. Use YYYY-MM-DD.`);
  return value.slice(0, 10);
}

export async function createTask(ctx: AgentContext, input: CreateTaskInput): Promise<CreatedTask> {
  const name = input.name.trim();
  if (!name) throw new AgentError("A task needs a name.");
  const board = findBoard(ctx, input.board, input.workspace);
  const notes: string[] = [];

  const { data: groupRows, error: groupError } = await ctx.supabase
    .from("groups")
    .select("*")
    .eq("board_id", board.id);
  if (groupError) fail(groupError, "read the board's groups");
  const group = settle(resolveGroup((groupRows ?? []) as Group[], input.group), "group", input.group ?? "(first group)");

  let values: Record<string, unknown> = {};

  // Dates go into the board's own date column: a timeline takes the range, a
  // single date takes the end (the deadline).
  let start = checkDate(input.start, "start");
  let end = checkDate(input.end, "end");
  if (start && end && end < start) [start, end] = [end, start];
  if (start || end) {
    const timeline = board.columns.find((c) => c.type === "timeline");
    const date = board.columns.find((c) => c.type === "date");
    if (timeline) values[timeline.id] = { start: start ?? end, end: end ?? start };
    else if (date) values[date.id] = end ?? start;
    else notes.push("This board has no date column, so the dates were not saved.");
  }

  let assigneeId: string | null = null;
  if (input.assignee) {
    const people = board.columns.find((c) => c.type === "people");
    if (!people) {
      notes.push("This board has no people column, so nobody was assigned.");
    } else {
      const wanted = input.assignee.trim().toLowerCase();
      const directory = await loadDirectory(ctx);
      const person =
        wanted === "me" || wanted === "moi" || wanted === "myself"
          ? directory.find((p) => p.id === ctx.userId) ?? { id: ctx.userId, full_name: ctx.fullName }
          : settle(resolvePerson(directory, input.assignee), "person", input.assignee);
      assigneeId = person.id;
      if (assigneeId !== ctx.userId && !(await canSeeBoard(ctx, person, board))) {
        throw new AgentError(`${input.assignee} cannot see ${boardLabel(board, ctx.workspaces)}, so they cannot be assigned there.`);
      }
      values[people.id] = [assigneeId];
    }
  }

  if (input.status) {
    const statusCol = statusColumnOf(board);
    if (!statusCol) {
      notes.push("This board has no status column, so the status was not set.");
    } else {
      const label = settle(resolveStatusLabel(statusCol, input.status), "status", input.status);
      values = applyDoneLink(board, values, statusCol.id, label).values;
    }
  }

  // Appended to the group, as typing a new row at its bottom does.
  const { data: last, error: lastError } = await ctx.supabase
    .from("items")
    .select("position")
    .eq("group_id", group.id)
    .order("position", { ascending: false })
    .limit(1);
  if (lastError) fail(lastError, "read the group");
  const position = last && last.length > 0 ? (last[0].position as number) + 1 : 0;

  const { data: created, error } = await ctx.supabase
    .from("items")
    .insert({
      board_id: board.id,
      group_id: group.id,
      name,
      position,
      column_values: withCellDefaults(board.columns, values),
    })
    .select()
    .single();
  if (error || !created) fail(error, "create the task");
  const item = created as Item;

  await logActivity(ctx, item, `Created "${name}"`);
  if (assigneeId) await notifyAssigned(ctx, item, board, [assigneeId]);

  return {
    task: summarizeTask(item, board, ctx.workspaces, ctx.today),
    group: group.title,
    notes,
  };
}

/**
 * The same rule the assignee picker uses (lib/boardAccess): only people who can
 * open the board, read from the same membership rows the app reads.
 */
async function canSeeBoard(ctx: AgentContext, person: DirectoryPerson, board: Board): Promise<boolean> {
  const workspace = ctx.workspaces.find((w) => w.id === board.workspace_id);
  const [boardMembers, workspaceMembers] = await Promise.all([
    ctx.supabase.from("board_members").select("user_id").eq("board_id", board.id),
    workspace
      ? ctx.supabase.from("workspace_members").select("user_id, role").eq("workspace_id", workspace.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (boardMembers.error) fail(boardMembers.error, "check who can see the board");
  if (workspaceMembers.error) fail(workspaceMembers.error, "check who can see the board");

  return hasBoardAccess(
    { id: person.id, role: person.role ?? undefined, is_staff: person.is_staff ?? undefined },
    board,
    workspace,
    new Set((boardMembers.data ?? []).map((r: { user_id: string }) => r.user_id)),
    new Map(
      (workspaceMembers.data ?? []).map((r: { user_id: string; role: string | null }) => [r.user_id, r.role || "member"])
    )
  );
}

export interface StatusChange {
  task: string;
  board: string;
  from: string | null;
  to: string;
  /** Set when a "move when done" rule filed the task into another group. */
  moved_to_group?: string;
  warning?: string;
}

export async function setStatus(ctx: AgentContext, taskId: string, wanted: string): Promise<StatusChange> {
  const { item, board } = await loadItem(ctx, taskId);
  const statusCol = statusColumnOf(board);
  if (!statusCol) throw new AgentError(`${boardLabel(board, ctx.workspaces)} has no status column.`);

  const label = settle(resolveStatusLabel(statusCol, wanted), "status", wanted);
  const existing = item.column_values || {};
  const previous = (existing[statusCol.id] as string | undefined) ?? null;
  if (previous === label) {
    return { task: item.name, board: boardLabel(board, ctx.workspaces), from: previous, to: label };
  }

  // The Done checkbox follows, exactly as in the table.
  const doneLink = applyDoneLink(board, existing, statusCol.id, label);

  // The board's "move when done" rule, with the missing-group heal.
  const { data: automationRows, error: automationError } = await ctx.supabase.rpc("automations_for_board", {
    b_id: board.id,
  });
  if (automationError) fail(automationError, "read the board's automations");
  const rule = evaluateEventAutomations(board, item, statusCol.id, previous, label, (automationRows ?? []) as Automation[]);

  let groupId = item.group_id;
  let warning: string | undefined;
  let movedTo: string | undefined;
  if (rule.targetGroupId) {
    const resolution = await resolveMoveTargetGroup(ctx.supabase, {
      boardId: board.id,
      targetGroupId: rule.targetGroupId,
      automationId: rule.matchedRuleId,
    });
    if (resolution.status === "ok") {
      groupId = resolution.groupId;
    } else {
      warning = "Saved, but the task could not be filed automatically - its Completed group is missing.";
    }
  }

  const { data: saved, error } = await ctx.supabase
    .from("items")
    .update({ column_values: doneLink.values, group_id: groupId })
    .eq("id", item.id)
    .select("id");
  if (error) fail(error, "change the status");
  if (!saved || saved.length === 0) throw new AgentError("You don't have permission to change that task. Nothing was changed.");

  if (groupId !== item.group_id) {
    const { data: group } = await ctx.supabase.from("groups").select("title").eq("id", groupId).maybeSingle();
    movedTo = group?.title ?? "another group";
  }

  await logActivity(ctx, item, `Changed "${statusCol.title || "Status"}" from "${previous || "Empty"}" to "${label}"`);

  return {
    task: item.name,
    board: boardLabel(board, ctx.workspaces),
    from: previous,
    to: label,
    ...(movedTo ? { moved_to_group: movedTo } : {}),
    ...(warning ? { warning } : {}),
  };
}

/** Plain text into the HTML the update editor saves: one paragraph per line. */
export function commentHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

export async function addComment(
  ctx: AgentContext,
  taskId: string,
  text: string
): Promise<{ task: string; board: string }> {
  const body = commentHtml(text);
  if (!body) throw new AgentError("The comment is empty.");
  const { item, board } = await loadItem(ctx, taskId);

  const { data, error } = await ctx.supabase
    .from("updates")
    .insert({ item_id: item.id, body, author_id: ctx.userId, author_name: ctx.fullName })
    .select("id")
    .single();
  if (error || !data) fail(error, "post the comment");

  return { task: item.name, board: boardLabel(board, ctx.workspaces) };
}
