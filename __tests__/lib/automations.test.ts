import { describe, it, expect, vi } from "vitest";
import { evaluateEventAutomations, evaluateTimeAutomations } from "@/lib/automations/engine";
import { Board, Item, Profile, Automation } from "@/types";

describe("Automation Engine — Sprint 7", () => {
  const mockBoard: Board = {
    id: "board-1",
    name: "Project Alpha",
    description: "Test board",
    columns: [
      { id: "col-status", title: "Status", type: "status" },
      { id: "col-date", title: "Due Date", type: "date" },
      { id: "col-person", title: "Owner", type: "people" },
    ],
    items: [],
  };

  const mockProfiles: Profile[] = [
    {
      id: "user-1",
      email: "younessnaitoufkir@gmail.com",
      full_name: "Youness Nait",
      role: "admin",
      avatar_initials: "YN",
      color: "blue",
    },
  ];

  describe("evaluateEventAutomations", () => {
    it("matches move_group automation when Status changes to Done", () => {
      const automations: Automation[] = [
        {
          id: "auto-1",
          board_id: "board-1",
          trigger_column_id: "col-status",
          trigger_value: "Done",
          action_type: "move_group",
          action_target_id: "group-completed",
          created_at: "",
        },
      ];

      const item: Item = {
        id: "item-1",
        board_id: "board-1",
        group_id: "group-backlog",
        name: "Task A",
        position: 0,
        column_values: { "col-status": "Done" },
      };

      const result = evaluateEventAutomations(
        mockBoard,
        item,
        "col-status",
        "Working on it",
        "Done",
        automations
      );

      expect(result.targetGroupId).toBe("group-completed");
      expect(result.matchedRuleId).toBe("auto-1");
    });

    it("matches move_group automation when Status changes to Cancelled", () => {
      const automations: Automation[] = [
        {
          id: "auto-2",
          board_id: "board-1",
          trigger_column_id: "col-status",
          trigger_value: "Cancelled",
          action_type: "move_group",
          action_target_id: "group-closed",
          created_at: "",
        },
      ];

      const item: Item = {
        id: "item-2",
        board_id: "board-1",
        group_id: "group-backlog",
        name: "Task B",
        position: 1,
        column_values: { "col-status": "Cancelled" },
      };

      const result = evaluateEventAutomations(
        mockBoard,
        item,
        "col-status",
        "Working on it",
        "Cancelled",
        automations
      );

      expect(result.targetGroupId).toBe("group-closed");
      expect(result.matchedRuleId).toBe("auto-2");
    });

    it("calculates shiftDays correctly when date column is postponed", () => {
      const item: Item = {
        id: "item-3",
        board_id: "board-1",
        group_id: "group-backlog",
        name: "Task C",
        position: 2,
        column_values: { "col-date": "2026-08-05" },
      };

      const result = evaluateEventAutomations(
        mockBoard,
        item,
        "col-date",
        "2026-08-02",
        "2026-08-05",
        []
      );

      expect(result.shiftDays).toBe(3);
    });
  });

  describe("evaluateTimeAutomations", () => {
    it("triggers overdue tagging when due date has passed and status is not Done", async () => {
      const pastDate = "2020-01-01";
      const boardWithAutomations: any = {
        ...mockBoard,
        automations: [
          {
            id: "auto-overdue",
            board_id: "board-1",
            trigger_column_id: "col-date",
            trigger_value: "due_date_passed",
            action_type: "overdue_tagging",
            enabled: true,
          },
        ],
        items: [
          {
            id: "item-overdue",
            board_id: "board-1",
            group_id: "group-1",
            name: "Late Task",
            position: 0,
            column_values: {
              "col-date": pastDate,
              "col-status": "Working on it",
              "col-person": "user-1",
            },
          },
        ],
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };

      const result = await evaluateTimeAutomations(
        boardWithAutomations,
        mockProfiles,
        mockSupabase
      );

      expect(result.triggeredCount).toBe(1);
      expect(result.updatedItemIds).toContain("item-overdue");
      expect(result.messages[0]).toContain("missed its due date");
      // Verify the engine returns the updated item for UI dispatch
      expect(result.updatedItems).toHaveLength(1);
      expect(result.updatedItems[0].id).toBe("item-overdue");
      expect(result.updatedItems[0].column_values["col-status"]).toBe("Overdue");
    });

    it("triggers SLA alert when due date is today and status is not Working on it", async () => {
      const todayStr = new Date().toISOString().split("T")[0];
      const boardWithAutomations: any = {
        ...mockBoard,
        automations: [
          {
            id: "auto-sla",
            board_id: "board-1",
            trigger_column_id: "col-date",
            trigger_value: "due_date_arrives",
            action_type: "sla_alert",
            enabled: true,
          },
        ],
        items: [
          {
            id: "item-sla",
            board_id: "board-1",
            group_id: "group-1",
            name: "SLA Task",
            position: 0,
            column_values: {
              "col-date": todayStr,
              "col-status": "Stuck",
              "col-person": "user-1",
            },
          },
        ],
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };

      const result = await evaluateTimeAutomations(
        boardWithAutomations,
        mockProfiles,
        mockSupabase
      );

      expect(result.triggeredCount).toBe(1);
      expect(result.messages[0]).toContain("is due today and is not marked 'Working on it'");
    });

    it("ignores move_group automation when enabled is false", () => {
      const automations: Automation[] = [
        {
          id: "auto-disabled",
          board_id: "board-1",
          trigger_column_id: "col-status",
          trigger_value: "Done",
          action_type: "move_group",
          action_target_id: "group-completed",
          enabled: false,
          created_at: "",
        },
      ];

      const item: Item = {
        id: "item-dis-1",
        board_id: "board-1",
        group_id: "group-backlog",
        name: "Task Disabled",
        position: 0,
        column_values: { "col-status": "Done" },
      };

      const result = evaluateEventAutomations(
        mockBoard,
        item,
        "col-status",
        "Working on it",
        "Done",
        automations
      );

      expect(result.targetGroupId).toBeUndefined();
      expect(result.matchedRuleId).toBeUndefined();
    });

    it("does not trigger overdue tagging when status is already Done", async () => {
      const pastDate = "2020-01-01";
      const boardWithAutomations: any = {
        ...mockBoard,
        automations: [
          {
            id: "auto-overdue",
            board_id: "board-1",
            trigger_column_id: "col-date",
            trigger_value: "due_date_passed",
            action_type: "overdue_tagging",
            enabled: true,
          },
        ],
        items: [
          {
            id: "item-done-past",
            board_id: "board-1",
            group_id: "group-1",
            name: "Completed On Time",
            position: 0,
            column_values: {
              "col-date": pastDate,
              "col-status": "Done",
              "col-person": "user-1",
            },
          },
        ],
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };

      const result = await evaluateTimeAutomations(
        boardWithAutomations,
        mockProfiles,
        mockSupabase
      );

      expect(result.triggeredCount).toBe(0);
      expect(result.updatedItemIds).toHaveLength(0);
    });

    it("does not trigger SLA alert when status is Working on it", async () => {
      const todayStr = new Date().toISOString().split("T")[0];
      const boardWithAutomations: any = {
        ...mockBoard,
        automations: [
          {
            id: "auto-sla",
            board_id: "board-1",
            trigger_column_id: "col-date",
            trigger_value: "due_date_arrives",
            action_type: "sla_alert",
            enabled: true,
          },
        ],
        items: [
          {
            id: "item-sla-working",
            board_id: "board-1",
            group_id: "group-1",
            name: "Active Task",
            position: 0,
            column_values: {
              "col-date": todayStr,
              "col-status": "Working on it",
              "col-person": "user-1",
            },
          },
        ],
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };

      const result = await evaluateTimeAutomations(
        boardWithAutomations,
        mockProfiles,
        mockSupabase
      );

      expect(result.triggeredCount).toBe(0);
      expect(result.messages).toHaveLength(0);
    });
  });
});

