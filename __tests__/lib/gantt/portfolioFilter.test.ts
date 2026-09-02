import { describe, it, expect } from "vitest";
import type { Board, Column, Item } from "@/types";
import {
  filterPortfolioItems,
  assigneesInPortfolio,
  statusesInPortfolio,
  windowForPreset,
  isPortfolioFilterActive,
  countActiveClauses,
  statusOf,
  EMPTY_PORTFOLIO_FILTER,
  type PortfolioFilter,
} from "@/lib/gantt/portfolioFilter";

const TIMELINE: Column = { id: "t", title: "Works", type: "timeline" };
const PEOPLE: Column = { id: "p", title: "Owner", type: "people" };
const STATUS_A: Column = { id: "sa", title: "Status", type: "status" };
const STATUS_B: Column = { id: "sb", title: "Status", type: "status" };

const alpha: Board = {
  id: "b1",
  name: "Lancement",
  description: "",
  workspace_id: "ws-a",
  columns: [TIMELINE, PEOPLE, STATUS_A],
};
const beta: Board = {
  id: "b2",
  name: "Travaux",
  description: "",
  workspace_id: "ws-b",
  // A different status column id, to check each item is read against its own board.
  columns: [TIMELINE, PEOPLE, STATUS_B],
};

const boardsById = new Map([
  [alpha.id, alpha],
  [beta.id, beta],
]);

function item(
  id: string,
  boardId: string,
  start: string,
  end: string,
  extra: Record<string, unknown> = {}
): Item {
  return {
    id,
    name: id,
    group_id: "g",
    board_id: boardId,
    position: 0,
    column_values: { [TIMELINE.id]: { start, end }, ...extra },
  };
}

const items: Item[] = [
  item("a", "b1", "2026-03-01", "2026-03-10", { p: ["amina"], sa: "Working on it" }),
  item("b", "b1", "2026-04-01", "2026-04-10", { p: ["leo"], sa: "Done" }),
  item("c", "b2", "2026-03-05", "2026-06-30", { p: ["amina", "leo"], sb: "Stuck" }),
  item("d", "b2", "2026-08-01", "2026-08-10", { sb: "Done" }),
];

const filter = (overrides: Partial<PortfolioFilter> = {}): PortfolioFilter => ({
  ...EMPTY_PORTFOLIO_FILTER,
  ...overrides,
});

const ids = (result: Item[]) => result.map((i) => i.id);

describe("filterPortfolioItems", () => {
  it("keeps everything when nothing is set", () => {
    expect(ids(filterPortfolioItems(items, boardsById, filter()))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("filters by owner across boards", () => {
    expect(ids(filterPortfolioItems(items, boardsById, filter({ assigneeIds: ["amina"] })))).toEqual([
      "a",
      "c",
    ]);
  });

  it("treats several owners as any-of", () => {
    expect(
      ids(filterPortfolioItems(items, boardsById, filter({ assigneeIds: ["leo", "amina"] })))
    ).toEqual(["a", "b", "c"]);
  });

  it("drops items with no owner when an owner is required", () => {
    expect(ids(filterPortfolioItems(items, boardsById, filter({ assigneeIds: ["amina"] })))).not.toContain("d");
  });

  it("filters by status, reading each item against its own board's column", () => {
    // "Done" lives in column `sa` on one board and `sb` on the other.
    expect(ids(filterPortfolioItems(items, boardsById, filter({ statuses: ["Done"] })))).toEqual([
      "b",
      "d",
    ]);
  });

  it("combines owner and status as an AND", () => {
    expect(
      ids(
        filterPortfolioItems(
          items,
          boardsById,
          filter({ assigneeIds: ["amina"], statuses: ["Stuck"] })
        )
      )
    ).toEqual(["c"]);
  });

  it("keeps a task that merely overlaps the window", () => {
    // "c" runs March to June: neither of its dates is inside May, but it is.
    expect(
      ids(filterPortfolioItems(items, boardsById, filter({ from: "2026-05-01", to: "2026-05-31" })))
    ).toEqual(["c"]);
  });

  it("excludes tasks wholly before or after the window", () => {
    const inMarch = filterPortfolioItems(items, boardsById, filter({ from: "2026-03-01", to: "2026-03-31" }));
    expect(ids(inMarch)).toEqual(["a", "c"]);
  });

  it("accepts an open-ended window at either end", () => {
    expect(ids(filterPortfolioItems(items, boardsById, filter({ from: "2026-07-01" })))).toEqual(["d"]);
    expect(ids(filterPortfolioItems(items, boardsById, filter({ to: "2026-03-04" })))).toEqual(["a"]);
  });

  it("drops an undated task when a window is set", () => {
    const undated = { ...item("e", "b1", "2026-01-01", "2026-01-02"), column_values: {} };
    const withUndated = [...items, undated];
    expect(ids(filterPortfolioItems(withUndated, boardsById, filter({ from: "2026-01-01" })))).not.toContain("e");
    // But keeps it when only owner or status is being filtered.
    expect(ids(filterPortfolioItems(withUndated, boardsById, filter()))).toContain("e");
  });

  it("does not crash on an item whose board is not loaded", () => {
    const orphan = item("z", "gone", "2026-03-01", "2026-03-02", { p: ["amina"] });
    expect(() =>
      filterPortfolioItems([orphan], boardsById, filter({ assigneeIds: ["amina"] }))
    ).not.toThrow();
    expect(ids(filterPortfolioItems([orphan], boardsById, filter({ assigneeIds: ["amina"] })))).toEqual([]);
  });
});

describe("what the menus offer", () => {
  it("lists only owners actually present", () => {
    expect(assigneesInPortfolio(items, boardsById).sort()).toEqual(["amina", "leo"]);
  });

  it("lists only statuses actually in use, sorted", () => {
    expect(statusesInPortfolio(items, boardsById)).toEqual(["Done", "Stuck", "Working on it"]);
  });

  it("reads a status through the item's own board", () => {
    expect(statusOf(items[0], alpha)).toBe("Working on it");
    expect(statusOf(items[2], beta)).toBe("Stuck");
    // Read against the wrong board there is nothing to find.
    expect(statusOf(items[2], alpha)).toBeNull();
  });
});

describe("window presets", () => {
  const today = new Date(2026, 4, 20); // 20 May 2026

  it("counts forward from today", () => {
    expect(windowForPreset("30", today)).toEqual({ from: "2026-05-20", to: "2026-06-19" });
    expect(windowForPreset("90", today)).toEqual({ from: "2026-05-20", to: "2026-08-18" });
  });


  it("sets no bounds for all or custom", () => {
    expect(windowForPreset("all", today)).toEqual({});
    expect(windowForPreset("custom", today)).toEqual({});
  });
});

describe("filter state", () => {
  it("knows when it is doing nothing", () => {
    expect(isPortfolioFilterActive(filter())).toBe(false);
    expect(isPortfolioFilterActive(filter({ assigneeIds: ["amina"] }))).toBe(true);
    expect(isPortfolioFilterActive(filter({ from: "2026-01-01" }))).toBe(true);
  });

  it("counts a date pair as one clause, not two", () => {
    expect(countActiveClauses(filter())).toBe(0);
    expect(countActiveClauses(filter({ from: "2026-01-01", to: "2026-02-01" }))).toBe(1);
    expect(
      countActiveClauses(filter({ assigneeIds: ["a"], statuses: ["Done"], from: "2026-01-01" }))
    ).toBe(3);
  });
});
