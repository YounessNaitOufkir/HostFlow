"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  deleteWorkspaceSchema,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from "@/lib/schemas";
import { sanitizeText } from "@/lib/sanitize";

export interface ServerActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export async function createWorkspaceAction(
  input: CreateWorkspaceInput
): Promise<ServerActionResult> {
  const parseResult = createWorkspaceSchema.safeParse(input);
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const newId = crypto.randomUUID();
    const { data, error } = await supabase
      .from("workspaces")
      .insert({
        id: newId,
        name: sanitizedName,
        icon: parseResult.data.icon || "Briefcase",
        is_private: parseResult.data.is_private,
        owner_id: user?.id || null,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create workspace" };
  }
}

export async function updateWorkspaceAction(
  input: UpdateWorkspaceInput
): Promise<ServerActionResult> {
  const parseResult = updateWorkspaceSchema.safeParse(input);
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
  if (parseResult.data.icon !== undefined) {
    updates.icon = parseResult.data.icon;
  }
  if (parseResult.data.is_private !== undefined) {
    updates.is_private = parseResult.data.is_private;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workspaces")
      .update(updates)
      .eq("id", parseResult.data.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update workspace" };
  }
}

export async function deleteWorkspaceAction(
  id: string
): Promise<ServerActionResult> {
  const parseResult = deleteWorkspaceSchema.safeParse({ id });
  if (!parseResult.success) {
    return { success: false, error: "Invalid workspace ID" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", parseResult.data.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete workspace" };
  }
}
