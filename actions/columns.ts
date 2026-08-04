"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createColumnSchema,
  updateColumnSchema,
  deleteColumnSchema,
  CreateColumnInput,
  UpdateColumnInput,
} from "@/lib/schemas";
import { sanitizeText } from "@/lib/sanitize";
import { ServerActionResult } from "@/actions/workspaces";

export async function createColumnAction(
  input: CreateColumnInput
): Promise<ServerActionResult> {
  const parseResult = createColumnSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parseResult.error.flatten().fieldErrors,
    };
  }

  const sanitizedName = sanitizeText(parseResult.data.name);

  try {
    const supabase = await createClient();
    const { data: board, error: fetchErr } = await supabase
      .from("boards")
      .select("columns")
      .eq("id", parseResult.data.boardId)
      .single();

    if (fetchErr) {
      return { success: false, error: fetchErr.message };
    }

    const columns = Array.isArray(board?.columns) ? [...board.columns] : [];
    const newColId = `${parseResult.data.type}_${crypto.randomUUID().slice(0, 8)}`;
    columns.push({
      id: newColId,
      name: sanitizedName,
      type: parseResult.data.type,
    });

    const { data, error: updateErr } = await supabase
      .from("boards")
      .update({ columns })
      .eq("id", parseResult.data.boardId)
      .select()
      .single();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create column" };
  }
}

export async function updateColumnAction(
  input: UpdateColumnInput
): Promise<ServerActionResult> {
  const parseResult = updateColumnSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parseResult.error.flatten().fieldErrors,
    };
  }

  try {
    const supabase = await createClient();
    const { data: board, error: fetchErr } = await supabase
      .from("boards")
      .select("columns")
      .eq("id", parseResult.data.boardId)
      .single();

    if (fetchErr) {
      return { success: false, error: fetchErr.message };
    }

    const columns = Array.isArray(board?.columns) ? [...board.columns] : [];
    const colIndex = columns.findIndex((col: any) => col.id === parseResult.data.columnId);
    if (colIndex === -1) {
      return { success: false, error: "Column not found" };
    }

    if (parseResult.data.name !== undefined) {
      columns[colIndex].name = sanitizeText(parseResult.data.name);
    }
    if (parseResult.data.type !== undefined) {
      columns[colIndex].type = parseResult.data.type;
    }

    const { data, error: updateErr } = await supabase
      .from("boards")
      .update({ columns })
      .eq("id", parseResult.data.boardId)
      .select()
      .single();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update column" };
  }
}

export async function deleteColumnAction(
  boardId: string,
  columnId: string
): Promise<ServerActionResult> {
  const parseResult = deleteColumnSchema.safeParse({ boardId, columnId });
  if (!parseResult.success) {
    return { success: false, error: "Invalid board or column ID" };
  }

  try {
    const supabase = await createClient();
    const { data: board, error: fetchErr } = await supabase
      .from("boards")
      .select("columns")
      .eq("id", boardId)
      .single();

    if (fetchErr) {
      return { success: false, error: fetchErr.message };
    }

    const columns = Array.isArray(board?.columns)
      ? board.columns.filter((col: any) => col.id !== columnId)
      : [];

    const { error: updateErr } = await supabase
      .from("boards")
      .update({ columns })
      .eq("id", boardId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete column" };
  }
}
