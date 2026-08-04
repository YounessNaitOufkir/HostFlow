import { describe, it, expect } from "vitest";
import { evaluateEventAutomations } from "@/lib/automations/engine";
import type { Board, Item } from "@/types";

describe("Timeline & Date Shifting Automation — Batch 3.3", () => {
  const mockBoard: Board = {
    id: "board-time-1",
    name: "Timeline Shifting Board",
    columns: [
      { id: "col-date", title: "Due Date", type: "date" },
      { id: "col-timeline", title: "Sprint Timeline", type: "timeline" },
      { id: "col-status", title: "Status", type: "status" },
    ],
  };

  const createMockItem = (column_values: Record<string, any>): Item => ({
    id: "item-time-1",
    board_id: "board-time-1",
    group_id: "group-1",
    name: "Dependent Task",
    position: 0,
    column_values,
  });

  it("computes shiftDays when a simple due date string is postponed", () => {
    const item = createMockItem({ "col-date": "2026-08-10" });
    const result = evaluateEventAutomations(
      mockBoard,
      item,
      "col-date",
      "2026-08-01",
      "2026-08-10",
      []
    );

    expect(result.shiftDays).toBe(9);
  });

  it("computes shiftDays when a timeline object start date is postponed", () => {
    const oldTimeline = { start: "2026-09-01", end: "2026-09-10" };
    const newTimeline = { start: "2026-09-06", end: "2026-09-15" };
    const item = createMockItem({ "col-timeline": newTimeline });

    const result = evaluateEventAutomations(
      mockBoard,
      item,
      "col-timeline",
      oldTimeline,
      newTimeline,
      []
    );

    expect(result.shiftDays).toBe(5);
  });

  it("does not set shiftDays when date is moved backwards (earlier date)", () => {
    const item = createMockItem({ "col-date": "2026-08-01" });
    const result = evaluateEventAutomations(
      mockBoard,
      item,
      "col-date",
      "2026-08-10",
      "2026-08-01",
      []
    );

    expect(result.shiftDays).toBeUndefined();
  });

  it("returns no shiftDays for non-date column changes", () => {
    const item = createMockItem({ "col-status": "Done" });
    const result = evaluateEventAutomations(
      mockBoard,
      item,
      "col-status",
      "Working on it",
      "Done",
      []
    );

    expect(result.shiftDays).toBeUndefined();
  });

  it("handles null or invalid dates gracefully without throwing", () => {
    const item = createMockItem({ "col-date": "invalid-date-str" });
    const result = evaluateEventAutomations(
      mockBoard,
      item,
      "col-date",
      null,
      "invalid-date-str",
      []
    );

    expect(result.shiftDays).toBeUndefined();
  });
});
