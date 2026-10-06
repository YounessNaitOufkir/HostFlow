import type { SupabaseClient } from "@supabase/supabase-js";
import type { Board, Item, Workspace } from "@/types";
import { fetchAllRows } from "@/lib/supabasePaging";
import { todayInTimezone } from "@/lib/orgTime";
import type { DelayNote } from "@/lib/delays";
import {
  boardLabel,
  normalizeName,
  resolveBoard,
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
export function fail(error: { message?: string; code?: string; hint?: string } | null, doing: string): never {
  // The AI gate (public.agent_request_gate) writes its refusals for the person.
  if (error?.hint === "hostflow-ai-gate" && error.message) throw new AgentError(error.message);
  // Row-level security says no in its own words; say it in ours.
  if (error?.code === "42501") throw new AgentError(`You don't have permission to ${doing}. Nothing was changed.`);
  console.error(`[agent] ${doing} failed:`, error);
  throw new AgentError(`Could not ${doing}. Nothing was changed.`);
}

export function settle<T>(resolution: Resolution<T>, what: string, asked: string): T {
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
  /** Workspaces the person allowed their assistant to change (Profile settings › AI assistant). */
  writable: Set<string>;
  /** The address the assistant connected to, for links that open in the right place. */
  appUrl: string;
}

/** Who is asking, what they can see, and what day it is for the company. */
export async function loadContext(supabase: SupabaseClient, userId: string, appUrl: string): Promise<AgentContext> {
  // Workspaces and boards arrive already narrowed to the person's AI scope: the
  // database's scope policies drop everything else from these reads.
  const [profile, workspaces, boards, settings, scopes] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("id", userId).maybeSingle(),
    fetchAllRows<Workspace>((from, to) =>
      supabase.from("workspaces").select("*").order("id").range(from, to)
    ),
    fetchAllRows<Board>((from, to) => supabase.from("boards").select("*").order("id").range(from, to)),
    supabase.from("organization_settings").select("default_timezone").limit(1).maybeSingle(),
    supabase.from("ai_workspace_scopes").select("workspace_id, can_write"),
  ]);
  if (profile.error) fail(profile.error, "read your profile");
  // The v2 database migration adds the scopes; until it has run, nothing is in
  // scope and every answer would be a confusing "not found".
  if (scopes.error) {
    console.error("[agent] AI scopes unreadable:", scopes.error);
    throw new AgentError("HostFlow's assistant connection is being updated. Try again in a few minutes.");
  }

  return {
    supabase,
    userId,
    fullName: profile.data?.full_name || "Someone",
    today: todayInTimezone(settings.data?.default_timezone ?? null),
    workspaces,
    boards,
    writable: new Set(
      ((scopes.data ?? []) as { workspace_id: string; can_write: boolean }[])
        .filter((s) => s.can_write)
        .map((s) => s.workspace_id)
    ),
    appUrl: appUrl.replace(/\/+$/, ""),
  };
}

/** A link that opens the task in context (lib/deepLink reads it). */
export function taskLink(ctx: AgentContext, boardId: string, itemId: string): string {
  return `${ctx.appUrl}/?${new URLSearchParams({ board: boardId, item: itemId }).toString()}`;
}

export function boardLink(ctx: AgentContext, boardId: string): string {
  return `${ctx.appUrl}/?${new URLSearchParams({ board: boardId }).toString()}`;
}

/** Every live item on the given boards (or every board the person can see). */
export async function loadItems(ctx: AgentContext, boardIds?: string[]): Promise<Item[]> {
  return fetchAllRows<Item>((from, to) => {
    let query = ctx.supabase.from("items").select("*").is("deleted_at", null).order("id");
    if (boardIds) query = query.in("board_id", boardIds);
    return query.range(from, to);
  });
}

export async function loadDirectory(ctx: AgentContext): Promise<DirectoryPerson[]> {
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

// ─── Shared by the write tools (lib/agent/edits.ts) ──────────────

export function findBoard(ctx: AgentContext, board: string, workspace?: string | null): Board {
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

export async function loadItem(ctx: AgentContext, taskId: string): Promise<{ item: Item; board: Board }> {
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
