import { describe, it, expect } from "vitest";
import type { Board, Column, Item } from "@/types";
import { newlyLateDays, slipOf, slipParts, unexplainedDays, type DelayNote } from "@/lib/delays";

const TL: Column = { id: "tl", title: "Timeline", type: "timeline" };
const board: Board = { id: "b1", name: "B", description: "", columns: [TL] };

function task(start: string, end: string, baselineEnd?: string): Item {
  return {
    id: "i1",
    name: "Plomberie",
    group_id: "g1",
    board_id: "b1",
    position: 0,
    column_values: { tl: { start, end } },
    ...(baselineEnd
      ? { baseline: { start: "2026-03-01", end: baselineEnd, captured_at: "2026-02-01T00:00:00Z" } }
      : {}),
  } as Item;
}

const note = (days: number): DelayNote => ({
  id: `n${days}`,
  item_id: "i1",
  board_id: "b1",
  days,
  category: "supplier",
  note: null,
  created_by: "u1",
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
});

describe("slipOf", () => {
  it("measures the end against the baseline end, as the Gantt does", () => {
    expect(slipOf(task("2026-03-01", "2026-03-10", "2026-03-06"), board)).toBe(4);
    expect(slipOf(task("2026-03-01", "2026-03-04", "2026-03-06"), board)).toBe(-2);
    expect(slipOf(task("2026-03-01", "2026-03-06", "2026-03-06"), board)).toBe(0);
  });

  it("has nothing to say without a baseline or dates", () => {
    expect(slipOf(task("2026-03-01", "2026-03-10"), board)).toBeNull();
    const undated = { ...task("2026-03-01", "2026-03-10", "2026-03-06"), column_values: {} };
    expect(slipOf(undated as Item, board)).toBeNull();
  });
});

describe("unexplainedDays", () => {
  it("is what the notes do not cover yet", () => {
    expect(unexplainedDays(4, [])).toBe(4);
    expect(unexplainedDays(4, [note(3)])).toBe(1);
    expect(unexplainedDays(4, [note(3), note(2)])).toBe(0);
  });

  it("works the same way for finishing early", () => {
    expect(unexplainedDays(-3, [])).toBe(-3);
    expect(unexplainedDays(-3, [note(-3)])).toBe(0);
  });

  it("is zero with no slip at all", () => {
    expect(unexplainedDays(null, [])).toBe(0);
    expect(unexplainedDays(0, [note(2)])).toBe(0);
  });
});

describe("newlyLateDays", () => {
  const plan = "2026-03-06";

  it("counts the days an edit pushed the task past its plan", () => {
    const before = task("2026-03-01", "2026-03-06", plan);
    expect(newlyLateDays(before, task("2026-03-01", "2026-03-09", plan), board)).toBe(3);
  });

  it("counts only the new days when the task was already late", () => {
    const before = task("2026-03-01", "2026-03-08", plan);
    expect(newlyLateDays(before, task("2026-03-01", "2026-03-09", plan), board)).toBe(1);
  });

  it("asks nothing when the task moves earlier, or stays within its plan", () => {
    expect(
      newlyLateDays(task("2026-03-01", "2026-03-09", plan), task("2026-03-01", "2026-03-07", plan), board)
    ).toBe(0);
    expect(
      newlyLateDays(task("2026-03-01", "2026-03-03", plan), task("2026-03-01", "2026-03-06", plan), board)
    ).toBe(0);
  });

  it("asks nothing without a baseline", () => {
    expect(newlyLateDays(task("2026-03-01", "2026-03-06"), task("2026-03-01", "2026-03-20"), board)).toBe(0);
  });
});

describe("slipParts", () => {
  const d = (day: number) => new Date(2026, 2, day);
  // A: planned 1-5, took to 7 (+2 of its own).
  // B waits on A: planned 6-10, pushed to start 8, ended 13 (+3: 2 from A, 1 its own).
  // C waits on B but ended on plan anyway.
  const tasks = [
    { id: "A", start: d(1), end: d(7), baseStart: d(1), baseEnd: d(5) },
    { id: "B", start: d(8), end: d(13), baseStart: d(6), baseEnd: d(10) },
    { id: "C", start: d(14), end: d(15), baseStart: d(11), baseEnd: d(15) },
    { id: "D", start: d(3), end: d(9), baseStart: d(1), baseEnd: d(6) },
  ];
  const deps = [
    { sourceId: "A", targetId: "B" },
    { sourceId: "B", targetId: "C" },
  ];

  it("keeps a task's own days apart from what late tasks before it pushed on", () => {
    const parts = slipParts(tasks, deps);
    expect(parts.get("A")).toEqual({ slip: 2, inherited: 0, own: 2 });
    expect(parts.get("B")).toEqual({ slip: 3, inherited: 2, own: 1 });
    // Pushed 3 days but made it all back: nothing lost, nothing to explain.
    expect(parts.get("C")).toEqual({ slip: 0, inherited: 0, own: 0 });
  });

  it("treats a late start with nothing to wait on as the task's own", () => {
    expect(slipParts(tasks, deps).get("D")).toEqual({ slip: 3, inherited: 0, own: 3 });
  });
});

describe("slipParts without links", () => {
  const d = (day: number) => new Date(2026, 2, day);

  it("takes an unlinked task to wait on what was planned to finish before it", () => {
    // Demolition then painting, never linked: painting was pushed 2 days.
    const parts = slipParts(
      [
        { id: "demo", start: d(1), end: d(7), baseStart: d(1), baseEnd: d(5) },
        { id: "paint", start: d(8), end: d(12), baseStart: d(6), baseEnd: d(10) },
        // Planned alongside demolition, so nothing before it could push it.
        { id: "order", start: d(3), end: d(4), baseStart: d(1), baseEnd: d(2) },
      ],
      []
    );
    expect(parts.get("paint")).toEqual({ slip: 2, inherited: 2, own: 0 });
    expect(parts.get("order")).toEqual({ slip: 2, inherited: 0, own: 2 });
  });
});
