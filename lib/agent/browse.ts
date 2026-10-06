import type { Board, Group, Item, ItemLink, Update } from "@/types";
import { fetchAllRows } from "@/lib/supabasePaging";
import { itemIsDone } from "@/lib/statusSemantics";
import { assigneeIdsOf } from "@/lib/gantt/rows";
import { boardLabel } from "@/lib/agent/resolve";
import { summarizeTask, type TaskSummary } from "@/lib/agent/reads";
import { describeColumn, readFieldValue, type ColumnDescription } from "@/lib/agent/fields";
import {
  AgentError,
  boardLink,
  fail,
  loadDirectory,
  loadItem,
  loadItems,
  taskLink,
  type AgentContext,
} from "@/lib/agent/service";

/**
 * The connector's ID-based reads. Every one of them only ever sees the
 * workspaces the person put in their assistant's scope: the database drops
 * the rest before it reaches here.
 */

function boardById(ctx: AgentContext, boardId: string): Board {
  const board = ctx.boards.find((b) => b.id === boardId);
  if (!board) throw new AgentError("That board is not in your assistant's scope, or does not exist.");
  return board;
}

export function listWorkspaces(ctx: AgentContext) {
  return ctx.workspaces
    .map((w) => ({
      workspace_id: w.id,
      name: w.name,
      private: w.is_private === true,
      access: ctx.writable.has(w.id) ? "read and write" : "read only",
      boards: ctx.boards.filter((b) => b.workspace_id === w.id).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listBoards(ctx: AgentContext, workspaceId: string) {
  const workspace = ctx.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) throw new AgentError("That workspace is not in your assistant's scope, or does not exist.");
  return {
    workspace_id: workspace.id,
    workspace: workspace.name,
    boards: ctx.boards
      .filter((b) => b.workspace_id === workspace.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
      .map((b) => ({ board_id: b.id, name: b.name, label: boardLabel(b, ctx.workspaces), link: boardLink(ctx, b.id) })),
  };
}

async function groupsOf(ctx: AgentContext, boardId: string): Promise<Group[]> {
  const { data, error } = await ctx.supabase.from("groups").select("*").eq("board_id", boardId).order("position");
  if (error) fail(error, "read the board's groups");
  return (data ?? []) as Group[];
}

export async function getBoard(ctx: AgentContext, boardId: string) {
  const board = boardById(ctx, boardId);
  const groups = await groupsOf(ctx, board.id);
  const columns: ColumnDescription[] = (board.columns ?? []).map(describeColumn);
  return {
    board_id: board.id,
    name: board.name,
    label: boardLabel(board, ctx.workspaces),
    workspace_id: board.workspace_id ?? null,
    can_write: !!board.workspace_id && ctx.writable.has(board.workspace_id),
    link: boardLink(ctx, board.id),
    groups: groups.map((g) => ({ group_id: g.id, title: g.title, position: g.position })),
    columns,
  };
}

// ─── Tasks ──────────────────────────────────────────────────────

/** Opaque, stable position in a board: group order, then row order, then id. */
function sortKey(item: Item, groupOrder: Map<string, number>): string {
  const g = String(groupOrder.get(item.group_id) ?? 9999).padStart(6, "0");
  const p = String(Math.max(0, Math.round((item.position ?? 0) * 1000))).padStart(12, "0");
  return `${g}.${p}.${item.id}`;
}

export interface ListTasksInput {
  board_id: string;
  group_id?: string | null;
  include_completed?: boolean;
  cursor?: string | null;
  limit?: number | null;
}

export async function listTasks(ctx: AgentContext, input: ListTasksInput) {
  const board = boardById(ctx, input.board_id);
  const [groups, items, directory] = await Promise.all([
    groupsOf(ctx, board.id),
    loadItems(ctx, [board.id]),
    loadDirectory(ctx),
  ]);
  if (input.group_id && !groups.some((g) => g.id === input.group_id)) {
    throw new AgentError("That group is not on this board.", groups.map((g) => `${g.title} (${g.id})`));
  }
  const names = new Map(directory.map((p) => [p.id, p.full_name]));
  const groupOrder = new Map(groups.map((g, i) => [g.id, i]));
  const groupTitle = new Map(groups.map((g) => [g.id, g.title]));
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  let after = "";
  if (input.cursor) {
    try {
      after = Buffer.from(input.cursor, "base64url").toString("utf8");
    } catch {
      throw new AgentError("That cursor is not valid. Start again without one.");
    }
  }

  const rows = items
    .filter((i) => !input.group_id || i.group_id === input.group_id)
    .filter((i) => input.include_completed || !itemIsDone(board.columns ?? [], i.column_values))
    .map((i) => ({ item: i, key: sortKey(i, groupOrder) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .filter((r) => !after || r.key > after);

  const page = rows.slice(0, limit);
  const more = rows.length > limit;
  return {
    board_id: board.id,
    board: boardLabel(board, ctx.workspaces),
    include_completed: input.include_completed === true,
    tasks: page.map(({ item }) => ({
      ...summarizeTask(item, board, ctx.workspaces, ctx.today),
      group_id: item.group_id,
      group: groupTitle.get(item.group_id) ?? "",
      assignees: assigneeIdsOf(item, board).map((id) => ({ id, name: names.get(id) ?? "Unknown" })),
      done: itemIsDone(board.columns ?? [], item.column_values),
      link: taskLink(ctx, board.id, item.id),
    })),
    next_cursor: more ? Buffer.from(page[page.length - 1].key, "utf8").toString("base64url") : null,
  };
}

/** A comment's HTML as plain text an assistant can read. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function getTask(ctx: AgentContext, taskId: string) {
  const { item, board } = await loadItem(ctx, taskId);
  const [groups, directory, updates, links] = await Promise.all([
    groupsOf(ctx, board.id),
    loadDirectory(ctx),
    fetchAllRows<Update>((from, to) =>
      ctx.supabase.from("updates").select("*").eq("item_id", item.id).is("deleted_at", null).order("created_at").range(from, to)
    ),
    ctx.supabase.from("item_links").select("*").or(`source_item_id.eq.${item.id},target_item_id.eq.${item.id}`),
  ]);
  if (links.error) fail(links.error, "read the task's links");
  const names = new Map(directory.map((p) => [p.id, p.full_name]));
  const allLinks = (links.data ?? []) as ItemLink[];

  // Names of the linked tasks, read in one go.
  const linkedIds = Array.from(
    new Set(allLinks.flatMap((l) => [l.source_item_id, l.target_item_id]).filter((id) => id !== item.id))
  );
  const linked = new Map<string, Item>();
  if (linkedIds.length > 0) {
    const { data, error } = await ctx.supabase.from("items").select("*").in("id", linkedIds).is("deleted_at", null);
    if (error) fail(error, "read linked tasks");
    for (const row of (data ?? []) as Item[]) linked.set(row.id, row);
  }
  const brief = (id: string) => {
    const other = linked.get(id);
    if (!other) return null;
    const otherBoard = ctx.boards.find((b) => b.id === other.board_id);
    return otherBoard
      ? { ...summarizeTask(other, otherBoard, ctx.workspaces, ctx.today), link: taskLink(ctx, otherBoard.id, other.id) }
      : { id: other.id, name: other.name };
  };

  const comments = updates.filter((u) => !u.parent_id);
  return {
    ...summarizeTask(item, board, ctx.workspaces, ctx.today),
    link: taskLink(ctx, board.id, item.id),
    group_id: item.group_id,
    group: groups.find((g) => g.id === item.group_id)?.title ?? "",
    done: itemIsDone(board.columns ?? [], item.column_values),
    created_at: item.created_at ?? null,
    updated_at: item.updated_at ?? null,
    fields: (board.columns ?? []).map((column) => ({
      column_id: column.id,
      title: column.title,
      type: column.type,
      value: readFieldValue(column, item.column_values?.[column.id], names),
    })),
    comments: comments.map((c) => ({
      comment_id: c.id,
      author: c.author_name,
      at: c.created_at,
      text: htmlToText(c.body),
      via_assistant: !!c.via_client_id,
      replies: updates
        .filter((r) => r.parent_id === c.id)
        .map((r) => ({ comment_id: r.id, author: r.author_name, at: r.created_at, text: htmlToText(r.body) })),
    })),
    parent: allLinks
      .filter((l) => l.link_type === "subitem" && l.target_item_id === item.id)
      .map((l) => brief(l.source_item_id))
      .find(Boolean) ?? null,
    subtasks: allLinks
      .filter((l) => l.link_type === "subitem" && l.source_item_id === item.id)
      .map((l) => brief(l.target_item_id))
      .filter(Boolean),
    depends_on: allLinks
      .filter((l) => l.link_type === "dependency" && l.target_item_id === item.id)
      .map((l) => brief(l.source_item_id))
      .filter(Boolean),
    blocks: allLinks
      .filter((l) => l.link_type === "dependency" && l.source_item_id === item.id)
      .map((l) => brief(l.target_item_id))
      .filter(Boolean),
  };
}

// ─── Members ────────────────────────────────────────────────────

export async function listMembers(ctx: AgentContext, input: { workspace_id?: string | null; board_id?: string | null }) {
  const board = input.board_id ? boardById(ctx, input.board_id) : null;
  const workspaceId = board?.workspace_id ?? input.workspace_id;
  const workspace = ctx.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) throw new AgentError("Say which workspace_id or board_id, within your assistant's scope.");

  const [directory, wsMembers, boardMembers] = await Promise.all([
    loadDirectory(ctx),
    ctx.supabase.from("workspace_members").select("user_id, role").eq("workspace_id", workspace.id),
    board ? ctx.supabase.from("board_members").select("user_id, role").eq("board_id", board.id) : Promise.resolve({ data: [], error: null }),
  ]);
  if (wsMembers.error) fail(wsMembers.error, "read the workspace's members");
  if (boardMembers.error) fail(boardMembers.error, "read the board's members");
  const person = new Map(directory.map((p) => [p.id, p]));

  const entry = (id: string, role: string | null, via: string) => {
    const p = person.get(id);
    return { user_id: id, name: p?.full_name ?? "Unknown", role: role || "member", via, company_admin: p?.role === "admin" };
  };

  const members = [
    ...(workspace.created_by ? [entry(workspace.created_by, "owner", "created the workspace")] : []),
    ...((wsMembers.data ?? []) as { user_id: string; role: string | null }[])
      .filter((m) => m.user_id !== workspace.created_by)
      .map((m) => entry(m.user_id, m.role, "workspace member")),
    ...((boardMembers.data ?? []) as { user_id: string; role: string | null }[]).map((m) => entry(m.user_id, m.role, "board member")),
  ];

  return {
    workspace_id: workspace.id,
    workspace: workspace.name,
    private: workspace.is_private === true,
    ...(board ? { board_id: board.id, board: boardLabel(board, ctx.workspaces) } : {}),
    members,
    note: workspace.is_private
      ? "Private workspace: only the people listed can open it."
      : "Shared workspace: company admins can open it too, besides the people listed.",
  };
}

export type { TaskSummary };
