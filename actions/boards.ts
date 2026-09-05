"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createBoardSchema,
  updateBoardSchema,
  deleteBoardSchema,
  CreateBoardInput,
  UpdateBoardInput,
} from "@/lib/schemas";
import { sanitizeText } from "@/lib/sanitize";
import { ServerActionResult } from "@/actions/workspaces";

export async function createBoardAction(
  input: CreateBoardInput
): Promise<ServerActionResult> {
  const parseResult = createBoardSchema.safeParse(input);
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
    const newId = crypto.randomUUID();

    const { data, error } = await supabase
      .from("boards")
      .insert({
        id: newId,
        name: sanitizedName,
        workspace_id: parseResult.data.workspace_id,
        columns: parseResult.data.columns || [
          { id: "person", name: "Owner", type: "person" },
          { id: "status", name: "Status", type: "status" },
          { id: "date", name: "Due Date", type: "date" },
        ],
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create board" };
  }
}

export async function updateBoardAction(
  input: UpdateBoardInput
): Promise<ServerActionResult> {
  const parseResult = updateBoardSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parseResult.error.flatten().fieldErrors,
    };
  }

  const updates: Record<string, any> = {};
  if (parseResult.data.name !== undefined) {
    updates.name = sanitizeText(parseResult.data.name);
  }
  if (parseResult.data.columns !== undefined) {
    updates.columns = parseResult.data.columns;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("boards")
      .update(updates)
      .eq("id", parseResult.data.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update board" };
  }
}

export async function deleteBoardAction(id: string): Promise<ServerActionResult> {
  const parseResult = deleteBoardSchema.safeParse({ id });
  if (!parseResult.success) {
    return { success: false, error: "Invalid board ID" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("boards")
      .delete()
      .eq("id", parseResult.data.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete board" };
  }
}
