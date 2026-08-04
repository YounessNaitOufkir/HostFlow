"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createItemSchema,
  updateItemSchema,
  updateItemCellSchema,
  deleteItemSchema,
  CreateItemInput,
  UpdateItemInput,
  UpdateItemCellInput,
} from "@/lib/schemas";
import { sanitizeText } from "@/lib/sanitize";
import { ServerActionResult } from "@/actions/workspaces";

export async function createItemAction(
  input: CreateItemInput
): Promise<ServerActionResult> {
  const parseResult = createItemSchema.safeParse(input);
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
      .from("items")
      .insert({
        id: newId,
        name: sanitizedName,
        board_id: parseResult.data.board_id,
        group_id: parseResult.data.group_id,
        column_values: parseResult.data.column_values || {},
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create item" };
  }
}

export async function updateItemAction(
  input: UpdateItemInput
): Promise<ServerActionResult> {
  const parseResult = updateItemSchema.safeParse(input);
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
  if (parseResult.data.group_id !== undefined) {
    updates.group_id = parseResult.data.group_id;
  }
  if (parseResult.data.column_values !== undefined) {
    updates.column_values = parseResult.data.column_values;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("items")
      .update(updates)
      .eq("id", parseResult.data.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update item" };
  }
}

export async function updateItemCellAction(
  input: UpdateItemCellInput
): Promise<ServerActionResult> {
  const parseResult = updateItemCellSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parseResult.error.flatten().fieldErrors,
    };
  }

  const { itemId, columnId, value } = parseResult.data;

  try {
    const supabase = await createClient();
    // 1. Fetch current item column_values
    const { data: currentItem, error: fetchErr } = await supabase
      .from("items")
      .select("column_values")
      .eq("id", itemId)
      .single();

    if (fetchErr) {
      return { success: false, error: fetchErr.message };
    }

    const currentValues = (currentItem?.column_values as Record<string, any>) || {};
    const updatedValues = { ...currentValues, [columnId]: value };

    const { data, error: updateErr } = await supabase
      .from("items")
      .update({ column_values: updatedValues })
      .eq("id", itemId)
      .select()
      .single();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update item cell" };
  }
}

export async function deleteItemAction(id: string): Promise<ServerActionResult> {
  const parseResult = deleteItemSchema.safeParse({ id });
  if (!parseResult.success) {
    return { success: false, error: "Invalid item ID" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("items")
      .delete()
      .eq("id", parseResult.data.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete item" };
  }
}
