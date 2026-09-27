import { supabase } from "@/lib/supabase";
import { writesSettled } from "@/lib/pendingWrites";
import { buildBoardFromTemplate, type TemplateSnapshot } from "@/lib/templateBoard";
import type { Board } from "@/types";

/** A company template as the pickers list it - without its snapshot. */
export interface BoardTemplateSummary {
  id: string;
  name: string;
  task_count: number;
  group_count: number;
  updated_at: string;
}

export type SaveTemplateResult = { ok: true; id: string } | { ok: false; reason: "taken" | "error"; message?: string };

export async function fetchBoardTemplates(): Promise<BoardTemplateSummary[]> {
  // RLS decides who sees them: admins and the Host'lik team, never externals.
  const { data, error } = await supabase
    .from("board_templates")
    .select("id, name, task_count, group_count, updated_at")
    .order("name");
  if (error) throw error;
  return (data ?? []) as BoardTemplateSummary[];
}

/**
 * Saves a board as a template, or - with `replace` - overwrites the template
 * of that name. Waits for the admin's own edits to land first, so the last
 * change made before clicking Save is in it.
 */
export async function saveBoardTemplate(boardId: string, name: string, replace: boolean): Promise<SaveTemplateResult> {
  await writesSettled();
  const { data, error } = await supabase.rpc("save_board_template", {
    p_board_id: boardId,
    p_name: name,
    p_replace: replace,
  });
  if (!error) return { ok: true, id: data as string };
  if (error.message?.includes("Template name taken")) return { ok: false, reason: "taken" };
  return { ok: false, reason: "error", message: error.message };
}

/** Renames a template. "taken" when another template already has the name. */
export async function renameBoardTemplate(id: string, name: string): Promise<"ok" | "taken" | "error"> {
  const { data, error } = await supabase
    .from("board_templates")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return error.code === "23505" ? "taken" : "error";
  // No row back means RLS refused it: only admins rename.
  return data && data.length > 0 ? "ok" : "error";
}

export async function deleteBoardTemplate(id: string): Promise<boolean> {
  const { data, error } = await supabase.from("board_templates").delete().eq("id", id).select("id");
  return !error && !!data && data.length > 0;
}

/**
 * Creates a board in a workspace from a template, dated from today.
 *
 * Written in dependency order - board, groups, tasks, then the links and
 * automations that point at them. A failure after the board exists leaves the
 * board rather than deleting it: the caller is told, and whatever was created
 * is real work the person can see and fix.
 */
export async function createBoardFromTemplate(
  templateId: string,
  workspaceId: string,
  name: string,
  startDay: Date = new Date()
): Promise<Board> {
  const { data: row, error: readError } = await supabase
    .from("board_templates")
    .select("snapshot")
    .eq("id", templateId)
    .single();
  if (readError || !row) throw readError ?? new Error("Template not found.");

  const built = buildBoardFromTemplate(row.snapshot as TemplateSnapshot, { workspaceId, name, startDay });

  const { data: board, error: boardError } = await supabase.from("boards").insert(built.board).select().single();
  if (boardError || !board) throw boardError ?? new Error("The board could not be created.");

  if (built.groups.length > 0) {
    const { error } = await supabase.from("groups").insert(built.groups);
    if (error) throw error;
  }
  // In batches: a large plan in one request can exceed the request size limit.
  for (let i = 0; i < built.items.length; i += 500) {
    const { error } = await supabase.from("items").insert(built.items.slice(i, i + 500));
    if (error) throw error;
  }
  if (built.links.length > 0) {
    const { error } = await supabase.from("item_links").insert(built.links);
    if (error) throw error;
  }
  if (built.automations.length > 0) {
    const { error } = await supabase.from("automations").insert(built.automations);
    if (error) throw error;
  }
  return board as Board;
}
