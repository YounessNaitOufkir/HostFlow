import { describe, it, expect } from "vitest";
import {
  applyDashboardFilter,
  isDashboardFilterActive,
  countActiveClauses,
  EMPTY_DASHBOARD_FILTER,
  type DashboardFilter,
} from "@/lib/dashboard/filter";
import type { Board, Item } from "@/types";

const board = {
  id: "b1",
  name: "Studio A",
  description: "",
  columns: [
    { id: "tl", title: "Timeline", type: "timeline" },
    { id: "who", title: "Assignee", type: "people" },
  ],
  items: [],
} as unknown as Board;

function item(id: string, values: Record<string, unknown>, groupId = "g1"): Item {
  return {
    id,
    board_id: "b1",
    group_id: groupId,
    name: id,
    position: 0,
    column_values: values,
  } as unknown as Item;
}

const items = [
  item("early", { tl: { start: "2026-01-01", end: "2026-01-10" }, who: ["u1"] }, "g1"),
  item("mid", { tl: { start: "2026-06-01", end: "2026-06-10" }, who: ["u2"] }, "g2"),
  item("undated", { who: ["u1"] }, "g1"),
];

const filter = (partial: Partial<DashboardFilter>): DashboardFilter => ({
  ...EMPTY_DASHBOARD_FILTER,
  ...partial,
});

describe("isDashboardFilterActive", () => {
  it("is off when nothing is set", () => {
    expect(isDashboardFilterActive(EMPTY_DASHBOARD_FILTER)).toBe(false);
  });

  it("counts each condition once, not each value", () => {
    expect(countActiveClauses(filter({ assigneeIds: ["u1", "u2"], from: "2026-01-01" }))).toBe(2);
  });
});

describe("applyDashboardFilter", () => {
  it("returns the same items untouched when nothing is set", () => {
    expect(applyDashboardFilter(board, items, EMPTY_DASHBOARD_FILTER)).toBe(items);
  });

  it("filters by group", () => {
    const out = applyDashboardFilter(board, items, filter({ groupIds: ["g2"] }));
    expect(out.map((i) => i.id)).toEqual(["mid"]);
  });

  it("filters by assignee", () => {
    const out = applyDashboardFilter(board, items, filter({ assigneeIds: ["u1"] }));
    expect(out.map((i) => i.id)).toEqual(["early", "undated"]);
  });

  it("filters on the end of a window, inclusive", () => {
    const out = applyDashboardFilter(
      board,
      items,
      filter({ from: "2026-01-10", to: "2026-01-10" })
    );
    expect(out.map((i) => i.id)).toEqual(["early"]);
  });

  it("leaves undated tasks out of any window", () => {
    // Otherwise "due in the next 30 days" silently includes tasks with no date,
    // and the tile reports a number nobody can act on.
    const out = applyDashboardFilter(board, items, filter({ from: "2020-01-01", to: "2030-01-01" }));
    expect(out.map((i) => i.id)).toEqual(["early", "mid"]);
  });

  it("combines conditions with AND", () => {
    const out = applyDashboardFilter(
      board,
      items,
      filter({ groupIds: ["g1"], assigneeIds: ["u1"], from: "2026-01-01", to: "2026-12-31" })
    );
    expect(out.map((i) => i.id)).toEqual(["early"]);
  });

  it("survives an absent board", () => {
    expect(applyDashboardFilter(null, items, filter({ groupIds: ["g1"] }))).toBe(items);
  });
});
