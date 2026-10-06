import type { Automation, Board, Column, Group, Item, ItemLink } from "@/types";
import { withCellDefaults } from "@/lib/cellDefaults";
import { applyDoneLink, STATUS_BEFORE_DONE, statusColumnOf } from "@/lib/doneLink";
import { evaluateEventAutomations } from "@/lib/automations/eventRules";
import { resolveMoveTargetGroup } from "@/lib/automations/moveTarget";
import { addDaysOnly, dayIndex, toDateOnly } from "@/lib/gantt/dates";
import { plotItemDates } from "@/lib/gantt/rows";
import { collectDependencies } from "@/lib/gantt/dependencies";
import { rescheduleFrom } from "@/lib/gantt/reschedule";
import { chunkIds } from "@/lib/supabasePaging";
import { escapeHtml } from "@/lib/escapeHtml";
import { sendTelegramAlert } from "@/lib/telegramAlerts";
import { syncAssigneeCalendars } from "@/lib/calendarSync";
import { hasBoardAccess } from "@/lib/boardAccess";
import { boardLabel, resolveGroup, resolvePerson, type DirectoryPerson } from "@/lib/agent/resolve";
import { summarizeTask, type TaskSummary } from "@/lib/agent/reads";
import { FieldError, findColumn, parseFieldValue } from "@/lib/agent/fields";
import { stableStringify } from "@/lib/agent/requests";
import {
  AgentError,
  fail,
  findBoard,
  loadDirectory,
  loadItem,
  loadItems,
  settle,
  taskLink,
  type AgentContext,
} from "@/lib/agent/service";

/**
 * Every write the connector makes, through one path that does what the app
 * does: the Done checkbox follows the status, the board's "move when done"
 * rule runs, dependent tasks are rescheduled when dates move, assignees are
 * notified (in HostFlow and on Telegram), and their Google Calendars are
 * updated. Each write reports those side effects back, so the assistant can
 * say what actually happened.
 *
 * Fields are patched with merge_item_values - only the keys that changed - so
 * an edit to one field never overwrites a colleague's edit to another. That
 * function returns nothing, so every write is confirmed by reading the task
 * back: an RLS-refused write is otherwise indistinguishable from a saved one.
 */

/** A write that would notify other people, stopped until the person approves it. */
export class ConfirmationNeeded extends Error {
  constructor(readonly wouldNotify: string[]) {
    super(`This would notify ${wouldNotify.join(", ")}.`);
    this.name = "ConfirmationNeeded";
  }
}

export interface WriteResult {
  task_id: string;
  name: string;
  board: string;
  board_id: string;
  group_id: string;
  group: string;
  link: string;
  task: TaskSummary;
  /** What else happened because of this write. */
  side_effects: string[];
  /** Things asked for that could not be done, said plainly. */
  notes: string[];
}

const ME = new Set(["me", "moi", "myself", "self"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Scope and people ───────────────────────────────────────────

/** Refuse early, in words, what the database would refuse anyway. */
export function requireWrite(ctx: AgentContext, board: Board): void {
  if (board.workspace_id && ctx.writable.has(board.workspace_id)) return;
  throw new AgentError(
    `Your assistant may read ${boardLabel(board, ctx.workspaces)} but not change it. ` +
      `To allow it, turn on Write for that workspace in HostFlow › Profile settings › AI assistant.`
  );
}

/** The same rule the assignee picker uses (lib/boardAccess), from the same membership rows. */
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

/** "me", ids or names → people who can open the board. */
async function resolvePeople(ctx: AgentContext, board: Board, wanted: string[]): Promise<DirectoryPerson[]> {
  const directory = await loadDirectory(ctx);
  const people: DirectoryPerson[] = [];
  for (const raw of wanted) {
    const w = raw.trim();
    let person: DirectoryPerson | undefined;
    if (ME.has(w.toLowerCase())) {
      person = directory.find((p) => p.id === ctx.userId) ?? { id: ctx.userId, full_name: ctx.fullName };
    } else if (UUID.test(w)) {
      person = directory.find((p) => p.id === w);
      if (!person) throw new AgentError(`No colleague you can see has the id ${w}.`);
    } else {
      person = settle(resolvePerson(directory, w), "person", w);
    }
    if (person.id !== ctx.userId && !(await canSeeBoard(ctx, person, board))) {
      throw new AgentError(
        `${person.full_name} cannot see ${boardLabel(board, ctx.workspaces)}, so they cannot be assigned there.`
      );
    }
    if (!people.some((p) => p.id === person!.id)) people.push(person);
  }
  return people;
}

/**
 * `fields` from a tool call → stored values by column id, every value checked.
 * People come back as ids; `names` collects their names for the report.
 */
async function prepareFields(
  ctx: AgentContext,
  board: Board,
  fields: Record<string, unknown>,
  names: Map<string, string>
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(fields)) {
    let column: Column;
    try {
      column = findColumn(board.columns ?? [], key);
      const parsed = parseFieldValue(column, raw);
      if (parsed.kind === "value") {
        out[column.id] = parsed.value;
      } else {
        const people = await resolvePeople(ctx, board, parsed.wanted);
        for (const p of people) names.set(p.id, p.full_name);
        out[column.id] = people.map((p) => p.id);
      }
    } catch (error) {
      if (error instanceof FieldError) throw new AgentError(error.message, error.options);
      throw error;
    }
  }
  return out;
}

// ─── The shared write path ──────────────────────────────────────

/**
 * Equal as stored values. Key order is ignored: Postgres hands jsonb objects
 * back with their keys sorted, so a timeline sent as {start, end} returns as
 * {end, start} - the same value.
 */
function sameValue(a: unknown, b: unknown): boolean {
  return stableStringify(a ?? null) === stableStringify(b ?? null);
}

function shown(value: unknown): string {
  if (value === undefined || value === null || value === "") return "Empty";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function peopleIn(board: Board, values: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  for (const col of board.columns ?? []) {
    if (col.type !== "people") continue;
    const v = values[col.id];
    if (Array.isArray(v)) for (const id of v) if (typeof id === "string") ids.add(id);
  }
  return ids;
}

/** Newly assigned people other than the caller - the ones a write would notify. */
function newlyAssignedOthers(ctx: AgentContext, board: Board, before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const was = peopleIn(board, before);
  return Array.from(peopleIn(board, after)).filter((id) => !was.has(id) && id !== ctx.userId);
}

async function logActivity(ctx: AgentContext, item: Pick<Item, "id" | "board_id">, action: string): Promise<void> {
  const { error } = await ctx.supabase
    .from("activity_logs")
    .insert({ item_id: item.id, board_id: item.board_id, user_id: ctx.userId, action });
  // The change itself landed; a lost history line is reported, not fatal.
  if (error) console.error("[agent] activity log write failed:", error);
}

/** In-app and Telegram, exactly as assigning someone in the table does. */
async function notifyAssigned(
  ctx: AgentContext,
  item: Item,
  board: Board,
  userIds: string[],
  names: Map<string, string>
): Promise<string | null> {
  if (userIds.length === 0) return null;
  const who = userIds.map((id) => names.get(id) ?? "a colleague").join(", ");

  const { error } = await ctx.supabase.rpc("notify_users_i18n", {
    recipient_ids: userIds,
    message_key: "notif.assignedToTask",
    message_vars: { actor: ctx.fullName, item: item.name },
    fallback: `${ctx.fullName} assigned you to the task "${item.name}".`,
    board_id: board.id,
    item_id: item.id,
  });
  const telegram = await sendTelegramAlert(ctx.supabase, userIds, "assignment", { actor: ctx.fullName, item: item.name });

  if (error) {
    console.error("[agent] assignment notification failed:", error);
    return `Assigned ${who}, but the HostFlow notification could not be sent.`;
  }
  return telegram.ok
    ? `Notified ${who} in HostFlow (and on Telegram where they have it connected).`
    : `Notified ${who} in HostFlow; the Telegram alert failed.`;
}

/** Name and dates as the calendar shows them, from the board's own date column. */
function calendarTask(item: Item, board: Board) {
  const plotted = plotItemDates(item, board);
  return {
    id: item.id,
    name: item.name,
    start: plotted ? toDateOnly(plotted.start) : undefined,
    end: plotted ? toDateOnly(plotted.end) : undefined,
    boardName: board.name,
  };
}

async function syncCalendars(ctx: AgentContext, item: Item, board: Board): Promise<string | null> {
  const assignees = Array.from(peopleIn(board, item.column_values ?? {}));
  if (assignees.length === 0) return null;
  const task = calendarTask(item, board);
  if (!task.start) return null;
  const result = await syncAssigneeCalendars(ctx.supabase, assignees, task);
  const parts: string[] = [];
  if (result.synced) parts.push(`Google Calendar updated for ${result.synced} ${result.synced === 1 ? "person" : "people"}`);
  if (result.reauthRequired) parts.push(`${result.reauthRequired} need to reconnect Google Calendar in HostFlow`);
  if (result.failed) parts.push(`${result.failed} calendar update${result.failed === 1 ? "" : "s"} failed`);
  return parts.length ? `${parts.join("; ")}.` : null;
}

/**
 * Patch cells and confirm them by reading the task back. Returns the saved row.
 *
 * merge_item_values returns nothing, and an update row-level security refuses
 * changes zero rows without an error, so the read-back is the only proof.
 * "Nothing was changed" is said only when the task is exactly as it was.
 */
async function patchCells(
  ctx: AgentContext,
  itemId: string,
  patch: Record<string, unknown>,
  before: Record<string, unknown>,
  doing: string
): Promise<Item> {
  if (Object.keys(patch).length > 0) {
    const { error } = await ctx.supabase.rpc("merge_item_values", { p_item_id: itemId, p_patch: patch });
    if (error) fail(error, doing);
  }
  const { data, error } = await ctx.supabase.from("items").select("*").eq("id", itemId).maybeSingle();
  if (error) fail(error, doing);
  const saved = data as Item | null;
  if (!saved) throw new AgentError(`Could not ${doing}: the task is no longer visible.`);

  const keys = Object.keys(patch);
  const landed = keys.filter((key) => sameValue(saved.column_values?.[key], patch[key]));
  if (landed.length === keys.length) return saved;
  if (keys.every((key) => sameValue(saved.column_values?.[key], before[key]))) {
    throw new AgentError(`You don't have permission to ${doing}. Nothing was changed.`);
  }
  // Someone else edited the same field at the same moment, or part of it saved.
  throw new AgentError(
    `HostFlow could not confirm that the change to "${saved.name}" was saved as sent. Check the task: ${taskLink(ctx, saved.board_id, saved.id)}`
  );
}

/**
 * Dates moved on the column the task is plotted from: move its successors the
 * way the board's dependency engine does. Returns what moved.
 */
async function rescheduleDependents(
  ctx: AgentContext,
  before: Item,
  item: Item,
  board: Board,
  changedColumns: string[]
): Promise<string[]> {
  const plotted = plotItemDates(item, board);
  if (!plotted || !changedColumns.includes(plotted.columnId)) return [];

  const items = await loadItems(ctx, [board.id]);
  const links: ItemLink[] = [];
  for (const ids of chunkIds(items.map((i) => i.id))) {
    const { data, error } = await ctx.supabase
      .from("item_links")
      .select("*")
      .eq("link_type", "dependency")
      .in("source_item_id", ids);
    if (error) fail(error, "read the task's dependencies");
    links.push(...((data ?? []) as ItemLink[]));
  }

  const current = items.map((i) => (i.id === item.id ? item : i));
  const tasks = new Map<string, { start: number; end: number }>();
  for (const candidate of current) {
    const at = plotItemDates(candidate, board);
    if (at) tasks.set(candidate.id, { start: dayIndex(at.start), end: dayIndex(at.end) });
  }
  // The engine moves successors from where the task WAS. The board was read
  // after the write, so its old position comes from the copy taken before it.
  const beforePlot = plotItemDates(before, board);
  if (beforePlot) tasks.set(item.id, { start: dayIndex(beforePlot.start), end: dayIndex(beforePlot.end) });

  const { moves, cycleDetected } = rescheduleFrom({
    tasks,
    dependencies: collectDependencies(current, new Map([[board.id, board]]), links),
    movedId: item.id,
    movedTo: { start: dayIndex(plotted.start), end: dayIndex(plotted.end) },
  });

  const report: string[] = [];
  const moved: string[] = [];
  for (const [movedId, position] of Array.from(moves.entries())) {
    if (movedId === item.id) continue;
    const target = current.find((i) => i.id === movedId);
    const targetPlot = target && plotItemDates(target, board);
    if (!target || !targetPlot) continue;
    const start = toDateOnly(addDaysOnly(targetPlot.start, position.start - dayIndex(targetPlot.start)));
    const end = toDateOnly(addDaysOnly(targetPlot.end, position.end - dayIndex(targetPlot.end)));
    const value = targetPlot.colType === "date" ? end : { start, end };
    await patchCells(ctx, movedId, { [targetPlot.columnId]: value }, target.column_values ?? {}, `reschedule "${target.name}"`);
    moved.push(`"${target.name}" (${start === end ? end : `${start} – ${end}`})`);
  }
  if (moved.length) report.push(`Rescheduled ${moved.length} dependent task${moved.length === 1 ? "" : "s"}: ${moved.join(", ")}.`);
  if (cycleDetected) report.push("These tasks depend on each other in a loop, so the plan could not be fully rescheduled.");
  return report;
}

interface ApplyOptions {
  confirmNotify: boolean;
  names: Map<string, string>;
  /** Present when the change is a rename too. */
  newName?: string | null;
}

/**
 * Apply field changes (by column id) and a rename to one task, with every rule
 * the app runs. Returns the saved task and what else happened.
 */
async function applyChanges(
  ctx: AgentContext,
  item: Item,
  board: Board,
  changes: Record<string, unknown>,
  options: ApplyOptions
): Promise<{ saved: Item; sideEffects: string[]; changed: boolean }> {
  const existing = (item.column_values ?? {}) as Record<string, unknown>;
  const statusCol = statusColumnOf(board);

  // The Done checkbox and the status follow each other, as in the table.
  let values: Record<string, unknown> = { ...existing };
  let statusChange: { from: unknown; to: unknown } | null = null;
  for (const [columnId, value] of Object.entries(changes)) {
    const before = values[statusCol?.id ?? ""];
    const link = applyDoneLink(board, values, columnId, value);
    values = link.values;
    if (statusCol && columnId === statusCol.id && !sameValue(before, value)) {
      statusChange = { from: before, to: value };
    } else if (link.statusChange) {
      statusChange = { from: link.statusChange.from, to: link.statusChange.to };
    }
  }

  // Notifying colleagues needs the person's say-so before anything is written.
  const notify = newlyAssignedOthers(ctx, board, existing, values);
  if (notify.length > 0 && !options.confirmNotify) {
    throw new ConfirmationNeeded(notify.map((id) => options.names.get(id) ?? id));
  }

  const patch: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(existing), ...Object.keys(values)])) {
    if (!sameValue(existing[key], values[key])) patch[key] = values[key] ?? null;
  }
  // The un-ticked task forgets what it was; null is how a patch says so.
  if (STATUS_BEFORE_DONE in existing && !(STATUS_BEFORE_DONE in values)) patch[STATUS_BEFORE_DONE] = null;

  const renamed = options.newName != null && options.newName.trim() !== "" && options.newName.trim() !== item.name;
  if (Object.keys(patch).length === 0 && !renamed) {
    return { saved: item, sideEffects: [], changed: false };
  }

  const sideEffects: string[] = [];

  // The board's "move when done" rule, with the missing-group heal.
  let targetGroupId = item.group_id;
  if (statusCol && statusChange) {
    const { data: rules, error } = await ctx.supabase.rpc("automations_for_board", { b_id: board.id });
    if (error) fail(error, "read the board's automations");
    const rule = evaluateEventAutomations(board, item, statusCol.id, statusChange.from, statusChange.to, (rules ?? []) as Automation[]);
    if (rule.targetGroupId) {
      const resolution = await resolveMoveTargetGroup(ctx.supabase, {
        boardId: board.id,
        targetGroupId: rule.targetGroupId,
        automationId: rule.matchedRuleId,
      });
      if (resolution.status === "ok") targetGroupId = resolution.groupId;
      else sideEffects.push("The board's rule could not file the task: its Completed group is missing.");
    }
  }

  let saved = await patchCells(ctx, item.id, patch, existing, `change "${item.name}"`);

  if (renamed || targetGroupId !== item.group_id) {
    const update: Record<string, unknown> = {};
    if (renamed) update.name = options.newName!.trim();
    if (targetGroupId !== item.group_id) update.group_id = targetGroupId;
    const { data, error } = await ctx.supabase.from("items").update(update).eq("id", item.id).select("*");
    if (error) fail(error, `change "${item.name}"`);
    if (!data || data.length === 0) throw new AgentError(`You don't have permission to change "${item.name}".`);
    saved = data[0] as Item;
    if (targetGroupId !== item.group_id) {
      const { data: group } = await ctx.supabase.from("groups").select("title").eq("id", targetGroupId).maybeSingle();
      sideEffects.push(`The board's rule moved it to "${group?.title ?? "another group"}".`);
    }
  }

  // History, one line per changed field, in the app's words.
  if (renamed) await logActivity(ctx, item, `Renamed from "${item.name}" to "${saved.name}"`);
  for (const column of board.columns ?? []) {
    if (!(column.id in patch)) continue;
    await logActivity(ctx, item, `Changed "${column.title}" from "${shown(existing[column.id])}" to "${shown(values[column.id])}"`);
  }
  if (statusCol && statusChange && !(statusCol.id in changes)) {
    sideEffects.push(`Status set to "${shown(statusChange.to)}" by the Done checkbox.`);
  }
  for (const column of board.columns ?? []) {
    if (column.type === "checkbox" && column.id in patch && !(column.id in changes)) {
      sideEffects.push(`"${column.title}" ${values[column.id] ? "ticked" : "unticked"} to match the status.`);
    }
  }

  sideEffects.push(...(await rescheduleDependents(ctx, item, saved, board, Object.keys(patch))));

  const notified = await notifyAssigned(ctx, saved, board, notify, options.names);
  if (notified) sideEffects.push(notified);

  // The calendar follows names, dates and assignees, as in the app.
  const dateOrPeople = (board.columns ?? []).some(
    (c) => c.id in patch && (c.type === "date" || c.type === "timeline" || c.type === "people")
  );
  if (renamed || dateOrPeople) {
    const synced = await syncCalendars(ctx, saved, board);
    if (synced) sideEffects.push(synced);
  }

  return { saved, sideEffects, changed: true };
}

async function groupTitle(ctx: AgentContext, groupId: string): Promise<string> {
  const { data } = await ctx.supabase.from("groups").select("title").eq("id", groupId).maybeSingle();
  return data?.title ?? "";
}

function result(ctx: AgentContext, saved: Item, board: Board, group: string, sideEffects: string[], notes: string[]): WriteResult {
  return {
    task_id: saved.id,
    name: saved.name,
    board: boardLabel(board, ctx.workspaces),
    board_id: board.id,
    group_id: saved.group_id,
    group,
    link: taskLink(ctx, board.id, saved.id),
    task: summarizeTask(saved, board, ctx.workspaces, ctx.today),
    side_effects: sideEffects,
    notes,
  };
}

// ─── Create ─────────────────────────────────────────────────────

export interface CreateTaskInput {
  board_id?: string | null;
  board?: string | null;
  workspace?: string | null;
  group_id?: string | null;
  group?: string | null;
  name: string;
  /** Any writable field, by column id or title. */
  fields?: Record<string, unknown> | null;
  // v1 shortcuts, still accepted.
  start?: string | null;
  end?: string | null;
  assignee?: string | null;
  status?: string | null;
  confirm_notify?: boolean;
  /** Set by create_subtask. */
  parent_task_id?: string | null;
}

function boardFor(ctx: AgentContext, input: { board_id?: string | null; board?: string | null; workspace?: string | null }): Board {
  if (input.board_id) {
    const board = ctx.boards.find((b) => b.id === input.board_id);
    if (!board) throw new AgentError("That board is not in your assistant's scope, or does not exist.");
    return board;
  }
  if (!input.board) throw new AgentError("Say which board: board_id, or its name.");
  return findBoard(ctx, input.board, input.workspace);
}

/** The v1 shortcuts (start/end, assignee, status) as `fields` entries. */
function shortcutFields(board: Board, input: CreateTaskInput, notes: string[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (input.start || input.end) {
    const timeline = board.columns.find((c) => c.type === "timeline");
    const date = board.columns.find((c) => c.type === "date");
    if (timeline) fields[timeline.id] = { start: input.start ?? input.end, end: input.end ?? input.start };
    else if (date) fields[date.id] = input.end ?? input.start;
    else notes.push("This board has no date column, so the dates were not saved.");
  }
  if (input.assignee) {
    const people = board.columns.find((c) => c.type === "people");
    if (people) fields[people.id] = [input.assignee];
    else notes.push("This board has no people column, so nobody was assigned.");
  }
  if (input.status) {
    const status = statusColumnOf(board);
    if (status) fields[status.id] = input.status;
    else notes.push("This board has no status column, so the status was not set.");
  }
  return fields;
}

export async function createTask(ctx: AgentContext, input: CreateTaskInput): Promise<WriteResult> {
  const name = input.name.trim();
  if (!name) throw new AgentError("A task needs a name.");

  let parent: Item | null = null;
  let board: Board;
  if (input.parent_task_id) {
    const loaded = await loadItem(ctx, input.parent_task_id);
    parent = loaded.item;
    board = loaded.board;
  } else {
    board = boardFor(ctx, input);
  }
  requireWrite(ctx, board);
  const notes: string[] = [];

  const { data: groupRows, error: groupError } = await ctx.supabase.from("groups").select("*").eq("board_id", board.id);
  if (groupError) fail(groupError, "read the board's groups");
  const groups = (groupRows ?? []) as Group[];
  let group: Group;
  if (input.group_id) {
    const found = groups.find((g) => g.id === input.group_id);
    if (!found) throw new AgentError("That group is not on this board.", groups.map((g) => `${g.title} (${g.id})`));
    group = found;
  } else if (parent && !input.group) {
    group = groups.find((g) => g.id === parent!.group_id) ?? settle(resolveGroup(groups, null), "group", "(first group)");
  } else {
    group = settle(resolveGroup(groups, input.group), "group", input.group ?? "(first group)");
  }

  // Shortcuts first, explicit fields win.
  const names = new Map<string, string>([[ctx.userId, ctx.fullName]]);
  const values = await prepareFields(ctx, board, { ...shortcutFields(board, input, notes), ...(input.fields ?? {}) }, names);

  // Done checkbox ↔ status, as if each field were set by hand.
  let initial: Record<string, unknown> = {};
  for (const [columnId, value] of Object.entries(values)) initial = applyDoneLink(board, initial, columnId, value).values;

  const notify = newlyAssignedOthers(ctx, board, {}, initial);
  if (notify.length > 0 && !input.confirm_notify) {
    throw new ConfirmationNeeded(notify.map((id) => names.get(id) ?? id));
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
      column_values: withCellDefaults(board.columns, initial),
    })
    .select()
    .single();
  if (error || !created) fail(error, "create the task");
  const item = created as Item;
  const sideEffects: string[] = [];

  await logActivity(ctx, item, `Created "${name}"`);

  if (parent) {
    const { data: link, error: linkError } = await ctx.supabase
      .from("item_links")
      .insert({ source_item_id: parent.id, target_item_id: item.id, link_type: "subitem" })
      .select("id");
    if (linkError || !link?.length) {
      notes.push(`The task was created, but it could not be linked under "${parent.name}".`);
    } else {
      await logActivity(ctx, parent, `Added subtask "${name}"`);
    }
  }

  const notified = await notifyAssigned(ctx, item, board, notify, names);
  if (notified) sideEffects.push(notified);
  const synced = await syncCalendars(ctx, item, board);
  if (synced) sideEffects.push(synced);

  return result(ctx, item, board, group.title, sideEffects, notes);
}

export async function createSubtask(
  ctx: AgentContext,
  input: Omit<CreateTaskInput, "board_id" | "board" | "workspace"> & { parent_task_id: string }
): Promise<WriteResult & { parent_task_id: string }> {
  // One level: a subtask cannot have subtasks of its own.
  const { data: parentLink, error } = await ctx.supabase
    .from("item_links")
    .select("id")
    .eq("link_type", "subitem")
    .eq("target_item_id", input.parent_task_id)
    .limit(1);
  if (error) fail(error, "read the parent task");
  if (parentLink && parentLink.length > 0) {
    throw new AgentError("That task is already a subtask. Subtasks go one level deep: add it to the parent task instead.");
  }
  return { ...(await createTask(ctx, input)), parent_task_id: input.parent_task_id };
}

// ─── Update ─────────────────────────────────────────────────────

export interface UpdateTaskInput {
  task_id: string;
  name?: string | null;
  fields?: Record<string, unknown> | null;
  confirm_notify?: boolean;
}

export async function updateTask(ctx: AgentContext, input: UpdateTaskInput): Promise<WriteResult & { changed: boolean }> {
  const { item, board } = await loadItem(ctx, input.task_id);
  requireWrite(ctx, board);
  if (input.name != null && !input.name.trim()) throw new AgentError("A task's name cannot be empty.");

  const names = new Map<string, string>([[ctx.userId, ctx.fullName]]);
  const changes = await prepareFields(ctx, board, input.fields ?? {}, names);
  const { saved, sideEffects, changed } = await applyChanges(ctx, item, board, changes, {
    confirmNotify: input.confirm_notify === true,
    names,
    newName: input.name,
  });
  return { ...result(ctx, saved, board, await groupTitle(ctx, saved.group_id), sideEffects, changed ? [] : ["Nothing changed: the task already had these values."]), changed };
}

/** v1's set_status, now the same path as any field update. */
export async function setStatus(ctx: AgentContext, taskId: string, wanted: string): Promise<WriteResult & { changed: boolean }> {
  const { board } = await loadItem(ctx, taskId);
  const status = statusColumnOf(board);
  if (!status) throw new AgentError(`${boardLabel(board, ctx.workspaces)} has no status column.`);
  return updateTask(ctx, { task_id: taskId, fields: { [status.id]: wanted } });
}

// ─── Move ───────────────────────────────────────────────────────

export async function moveTask(ctx: AgentContext, taskId: string, groupId: string): Promise<WriteResult> {
  const { item, board } = await loadItem(ctx, taskId);
  requireWrite(ctx, board);

  const { data: group, error } = await ctx.supabase.from("groups").select("*").eq("id", groupId).maybeSingle();
  if (error) fail(error, "read the group");
  if (!group || group.board_id !== board.id) {
    const { data: groups } = await ctx.supabase.from("groups").select("id, title").eq("board_id", board.id);
    throw new AgentError(
      "Tasks can only move between groups of their own board. These are the groups on this board:",
      ((groups ?? []) as { id: string; title: string }[]).map((g) => `${g.title} (${g.id})`)
    );
  }
  if (group.id === item.group_id) {
    return result(ctx, item, board, group.title, [], [`Already in "${group.title}".`]);
  }

  const { data: last } = await ctx.supabase
    .from("items")
    .select("position")
    .eq("group_id", group.id)
    .order("position", { ascending: false })
    .limit(1);
  const position = last && last.length > 0 ? (last[0].position as number) + 1 : 0;

  const { data, error: moveError } = await ctx.supabase
    .from("items")
    .update({ group_id: group.id, position })
    .eq("id", item.id)
    .select("*");
  if (moveError) fail(moveError, `move "${item.name}"`);
  if (!data || data.length === 0) throw new AgentError(`You don't have permission to move "${item.name}".`);

  const from = await groupTitle(ctx, item.group_id);
  await logActivity(ctx, item, `Moved from "${from}" to "${group.title}"`);
  return result(ctx, data[0] as Item, board, group.title, [], []);
}

// ─── Comment ────────────────────────────────────────────────────

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
): Promise<{ comment_id: string; task_id: string; task: string; board: string; link: string; side_effects: string[] }> {
  const body = commentHtml(text);
  if (!body) throw new AgentError("The comment is empty.");
  const { item, board } = await loadItem(ctx, taskId);
  requireWrite(ctx, board);

  const { data, error } = await ctx.supabase
    .from("updates")
    .insert({ item_id: item.id, body, author_id: ctx.userId, author_name: ctx.fullName })
    .select("id")
    .single();
  if (error || !data) fail(error, "post the comment");

  return {
    comment_id: data.id,
    task_id: item.id,
    task: item.name,
    board: boardLabel(board, ctx.workspaces),
    link: taskLink(ctx, board.id, item.id),
    // Plain comments notify nobody in HostFlow; only @mentions do, and the
    // connector does not write them.
    side_effects: [],
  };
}
