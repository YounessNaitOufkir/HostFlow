import { describe, it, expect } from "vitest";
import type { Board, Column, Group, Item, ItemLink } from "@/types";
import { buildProjectReview } from "@/lib/projectReview";
import type { DelayNote } from "@/lib/delays";

const TL: Column = { id: "tl", title: "Timeline", type: "timeline" };
const ST: Column = { id: "st", title: "Status", type: "status" };
const board: Board = { id: "b1", name: "Apt", description: "", columns: [TL, ST] };
const groups: Group[] = [{ id: "g1", title: "Travaux", color: "#579bfc", position: 0, board_id: "b1" }];

function task(
  id: string,
  start: string,
  end: string,
  baseline?: [string, string],
  status?: string,
  position = 0
): Item {
  return {
    id,
    name: id.toUpperCase(),
    group_id: "g1",
    board_id: "b1",
    position,
    column_values: { tl: { start, end }, ...(status ? { st: status } : {}) },
    ...(baseline
      ? { baseline: { start: baseline[0], end: baseline[1], captured_at: "2026-01-01T00:00:00Z" } }
      : {}),
  } as Item;
}

const note = (item_id: string, days: number, category: DelayNote["category"], text = ""): DelayNote => ({
  id: `${item_id}-${category}-${days}`,
  item_id,
  board_id: "b1",
  days,
  category,
  note: text || null,
  created_by: "u1",
  created_at: "2026-03-10T00:00:00Z",
  updated_at: "2026-03-10T00:00:00Z",
});

const link = (source: string, target: string): ItemLink => ({
  id: `${source}-${target}`,
  source_item_id: source,
  target_item_id: target,
  link_type: "dependency",
  dep_type: "FS",
  lag_days: 0,
  created_at: "2026-01-01T00:00:00Z",
});

describe("buildProjectReview", () => {
  it("says so when nothing has dates, or nothing has a baseline", () => {
    expect(buildProjectReview({ board, groups, items: [], notes: [] }).state).toBe("noDates");
    expect(
      buildProjectReview({ board, groups, items: [task("a", "2026-03-01", "2026-03-05")], notes: [] }).state
    ).toBe("noBaseline");
  });

  // A (plan Mar 1-5, took to Mar 8: +3) → B (plan Mar 6-10, ran Mar 9-13: +3).
  // C ran alongside, planned to Mar 4, finished Mar 6: +2, but with room.
  const items = [
    task("a", "2026-03-01", "2026-03-08", ["2026-03-01", "2026-03-05"], "Done", 0),
    task("b", "2026-03-09", "2026-03-13", ["2026-03-06", "2026-03-10"], "Done", 1),
    task("c", "2026-03-01", "2026-03-06", ["2026-03-01", "2026-03-04"], "Done", 2),
    task("d", "2026-03-02", "2026-03-03", ["2026-03-02", "2026-03-05"], "Done", 3),
  ];
  const links = [link("a", "b")];

  it("compares the finish with the plan", () => {
    const review = buildProjectReview({ board, groups, items, itemLinks: links, notes: [] });
    expect(review.state).toBe("ready");
    expect(review.finished).toBe(true);
    expect(review.plannedFinish).toEqual(new Date(2026, 2, 10));
    expect(review.finish).toEqual(new Date(2026, 2, 13));
    expect(review.finishSlip).toBe(3);
    expect(review.late.map((t) => [t.item.id, t.slip])).toEqual([
      ["a", 3],
      ["b", 3],
      ["c", 2],
    ]);
    expect(review.early.map((t) => [t.item.id, t.slip])).toEqual([["d", -2]]);
  });

  it("tells delays that moved the finish from ones slack absorbed", () => {
    const review = buildProjectReview({ board, groups, items, itemLinks: links, notes: [] });
    const moved = Object.fromEntries(review.late.map((t) => [t.item.id, t.movedFinish]));
    // Done tasks still count: this is about which chain decided the finish.
    expect(moved).toEqual({ a: true, b: true, c: false });
  });

  it("adds up the days lost by reason, and what is left unexplained", () => {
    const review = buildProjectReview({
      board,
      groups,
      items,
      itemLinks: links,
      notes: [
        note("a", 2, "supplier", "Tiles late"),
        note("b", 3, "supplier"),
        note("c", 1, "contractor"),
        // On a task that finished early: a gain, not a loss.
        note("d", -2, "other", "Faster crew"),
      ],
    });
    expect(review.lostByReason).toEqual([
      { category: "supplier", days: 5 },
      { category: "contractor", days: 1 },
    ]);
    // A: 1 of 3 unexplained; B: 0; C: 1 of 2.
    expect(review.unexplainedTotal).toBe(2);
    expect(review.lessons.map((l) => [l.category, l.notes.length])).toEqual([
      ["supplier", 2],
      ["contractor", 1],
      ["other", 1],
    ]);
    expect(review.lessons[0].notes[0].taskName).toBe("A");
  });

  it("forecasts while work is still open", () => {
    const open = items.map((i, n) => (n === 1 ? task("b", "2026-03-09", "2026-03-13", ["2026-03-06", "2026-03-10"]) : i));
    expect(buildProjectReview({ board, groups, items: open, notes: [] }).finished).toBe(false);
  });

  it("lists work added after the plan was set", () => {
    const review = buildProjectReview({
      board,
      groups,
      items: [...items, task("e", "2026-03-11", "2026-03-12")],
      notes: [],
    });
    expect(review.addedAfterPlan.map((t) => t.item.id)).toEqual(["e"]);
    expect(review.baselinedCount).toBe(4);
    expect(review.taskCount).toBe(5);
  });

  it("leaves out deleted tasks", () => {
    const deleted = { ...items[0], deleted_at: "2026-03-20T00:00:00Z" } as Item;
    const review = buildProjectReview({ board, groups, items: [deleted, ...items.slice(1)], notes: [] });
    expect(review.late.map((t) => t.item.id)).not.toContain("a");
  });
});
