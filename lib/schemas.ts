import { z } from "zod";

// ==========================================
// Workspace Validation Schemas
// ==========================================
export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .min(1, "Workspace name is required")
    .max(100, "Workspace name must be under 100 characters"),
  icon: z.string().optional(),
  is_private: z.boolean().default(false),
});

export const updateWorkspaceSchema = z.object({
  id: z.string().min(1, "Workspace ID is required"),
  name: z
    .string()
    .min(1, "Workspace name is required")
    .max(100, "Workspace name must be under 100 characters")
    .optional(),
  icon: z.string().optional(),
  is_private: z.boolean().optional(),
});

export const deleteWorkspaceSchema = z.object({
  id: z.string().min(1, "Workspace ID is required"),
});

// ==========================================
// Board Validation Schemas
// ==========================================
export const createBoardSchema = z.object({
  name: z
    .string()
    .min(1, "Board name is required")
    .max(100, "Board name must be under 100 characters"),
  workspace_id: z.string().min(1, "Workspace ID is required"),
  columns: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
      })
    )
    .optional(),
});

export const updateBoardSchema = z.object({
  id: z.string().min(1, "Board ID is required"),
  name: z
    .string()
    .min(1, "Board name is required")
    .max(100, "Board name must be under 100 characters")
    .optional(),
  columns: z.array(z.any()).optional(),
});

export const deleteBoardSchema = z.object({
  id: z.string().min(1, "Board ID is required"),
});

// ==========================================
// Group Validation Schemas
// ==========================================
export const createGroupSchema = z.object({
  name: z
    .string()
    .min(1, "Group name is required")
    .max(100, "Group name must be under 100 characters"),
  board_id: z.string().min(1, "Board ID is required"),
  color: z.string().optional(),
  position: z.number().optional(),
});

export const updateGroupSchema = z.object({
  id: z.string().min(1, "Group ID is required"),
  name: z
    .string()
    .min(1, "Group name is required")
    .max(100, "Group name must be under 100 characters")
    .optional(),
  color: z.string().optional(),
  position: z.number().optional(),
});

export const deleteGroupSchema = z.object({
  id: z.string().min(1, "Group ID is required"),
});

// ==========================================
// Item & Cell Validation Schemas
// ==========================================
export const createItemSchema = z.object({
  name: z
    .string()
    .min(1, "Item name is required")
    .max(200, "Item name must be under 200 characters"),
  board_id: z.string().min(1, "Board ID is required"),
  group_id: z.string().min(1, "Group ID is required"),
  column_values: z.record(z.string(), z.any()).optional(),
});

export const updateItemSchema = z.object({
  id: z.string().min(1, "Item ID is required"),
  name: z
    .string()
    .min(1, "Item name is required")
    .max(200, "Item name must be under 200 characters")
    .optional(),
  group_id: z.string().min(1).optional(),
  column_values: z.record(z.string(), z.any()).optional(),
});

export const updateItemCellSchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  columnId: z.string().min(1, "Column ID is required"),
  value: z.any(),
});

export const deleteItemSchema = z.object({
  id: z.string().min(1, "Item ID is required"),
});

// ==========================================
// Column Validation Schemas
// ==========================================
export const createColumnSchema = z.object({
  boardId: z.string().min(1, "Board ID is required"),
  name: z
    .string()
    .min(1, "Column name is required")
    .max(50, "Column name must be under 50 characters"),
  type: z.enum([
    "text",
    "status",
    "date",
    "person",
    "number",
    "timeline",
    "priority",
    "tags",
    "checkbox",
    "dropdown",
    "link",
    "email",
    "phone",
    "rating",
    "progress",
    "color",
  ]),
});

export const updateColumnSchema = z.object({
  boardId: z.string().min(1, "Board ID is required"),
  columnId: z.string().min(1, "Column ID is required"),
  name: z
    .string()
    .min(1, "Column name is required")
    .max(50, "Column name must be under 50 characters")
    .optional(),
  type: z.string().optional(),
});

export const deleteColumnSchema = z.object({
  boardId: z.string().min(1, "Board ID is required"),
  columnId: z.string().min(1, "Column ID is required"),
});

// ==========================================
// Item Links & Automation Schemas
// ==========================================
export const createLinkSchema = z.object({
  source_item_id: z.string().min(1, "Source Item ID is required"),
  target_item_id: z.string().min(1, "Target Item ID is required"),
  link_type: z.enum(["related", "blocked_by", "blocking", "duplicate"]),
});

export const createAutomationSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
  trigger_type: z.enum(["status_change", "date_arrived", "item_created"]),
  config: z.record(z.string(), z.any()),
});

// Inferred TypeScript Types
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type UpdateItemCellInput = z.infer<typeof updateItemCellSchema>;
export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
export type CreateLinkInput = z.infer<typeof createLinkSchema>;
export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
