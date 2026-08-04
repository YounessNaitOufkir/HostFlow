import { describe, it, expect } from "vitest";
import {
  createWorkspaceSchema,
  createBoardSchema,
  createGroupSchema,
  createItemSchema,
  createColumnSchema,
  createLinkSchema,
  createAutomationSchema,
} from "@/lib/schemas";

describe("Zod Validation Schemas", () => {
  describe("createWorkspaceSchema", () => {
    it("accepts valid workspace payload", () => {
      const result = createWorkspaceSchema.safeParse({
        name: "Engineering Team",
        is_private: false,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty workspace name", () => {
      const result = createWorkspaceSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("rejects workspace name over 100 characters", () => {
      const result = createWorkspaceSchema.safeParse({
        name: "A".repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createBoardSchema", () => {
    it("accepts valid board payload", () => {
      const result = createBoardSchema.safeParse({
        name: "Q3 Roadmap",
        workspace_id: "ws-123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects board missing workspace_id", () => {
      const result = createBoardSchema.safeParse({ name: "Board without WS" });
      expect(result.success).toBe(false);
    });
  });

  describe("createGroupSchema", () => {
    it("accepts valid group payload with color and position", () => {
      const result = createGroupSchema.safeParse({
        name: "In Progress",
        board_id: "board-1",
        color: "#ff5722",
        position: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects group missing board_id", () => {
      const result = createGroupSchema.safeParse({ name: "Orphaned Group" });
      expect(result.success).toBe(false);
    });
  });

  describe("createItemSchema", () => {
    it("accepts valid item payload with column_values", () => {
      const result = createItemSchema.safeParse({
        name: "Implement Auth Feature",
        board_id: "board-1",
        group_id: "group-1",
        column_values: { status: "Done", person: "Alice" },
      });
      expect(result.success).toBe(true);
    });

    it("rejects item name exceeding 200 characters", () => {
      const result = createItemSchema.safeParse({
        name: "X".repeat(201),
        board_id: "board-1",
        group_id: "group-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createColumnSchema", () => {
    it("accepts supported column types", () => {
      const result = createColumnSchema.safeParse({
        boardId: "board-1",
        name: "Priority",
        type: "priority",
      });
      expect(result.success).toBe(true);
    });

    it("rejects unsupported column type", () => {
      const result = createColumnSchema.safeParse({
        boardId: "board-1",
        name: "Invalid Col",
        type: "unsupported_type",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createLinkSchema & createAutomationSchema", () => {
    it("validates link_type enum correctly", () => {
      const result = createLinkSchema.safeParse({
        source_item_id: "a",
        target_item_id: "b",
        link_type: "blocked_by",
      });
      expect(result.success).toBe(true);

      const invalid = createLinkSchema.safeParse({
        source_item_id: "a",
        target_item_id: "b",
        link_type: "not_a_valid_type",
      });
      expect(invalid.success).toBe(false);
    });

    it("validates automation trigger_type enum correctly", () => {
      const result = createAutomationSchema.safeParse({
        board_id: "board-1",
        trigger_type: "status_change",
        config: { columnId: "status", toValue: "Done" },
      });
      expect(result.success).toBe(true);
    });
  });
});
