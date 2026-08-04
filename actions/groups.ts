"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createGroupSchema,
  updateGroupSchema,
  deleteGroupSchema,
  CreateGroupInput,
  UpdateGroupInput,
} from "@/lib/schemas";
import { sanitizeText } from "@/lib/sanitize";
import { ServerActionResult } from "@/actions/workspaces";

export async function createGroupAction(
  input: CreateGroupInput
): Promise<ServerActionResult> {
  const parseResult = createGroupSchema.safeParse(input);
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
      .from("groups")
      .insert({
        id: newId,
        name: sanitizedName,
        board_id: parseResult.data.board_id,
        color: parseResult.data.color || "#0073ea",
        position: parseResult.data.position ?? 0,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create group" };
  }
}

export async function updateGroupAction(
  input: UpdateGroupInput
): Promise<ServerActionResult> {
  const parseResult = updateGroupSchema.safeParse(input);
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
  if (parseResult.data.color !== undefined) {
    updates.color = parseResult.data.color;
  }
  if (parseResult.data.position !== undefined) {
    updates.position = parseResult.data.position;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("groups")
      .update(updates)
      .eq("id", parseResult.data.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update group" };
  }
}

export async function deleteGroupAction(id: string): Promise<ServerActionResult> {
  const parseResult = deleteGroupSchema.safeParse({ id });
  if (!parseResult.success) {
    return { success: false, error: "Invalid group ID" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("groups")
      .delete()
      .eq("id", parseResult.data.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete group" };
  }
}
