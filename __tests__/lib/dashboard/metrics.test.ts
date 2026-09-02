import { describe, it, expect } from "vitest";
import {
  computeDashboardMetrics,
  hexFromStatusColor,
  dueDateOf,
  assigneeIdOf,
} from "@/lib/dashboard/metrics";
import type { Board, Group, Item, Profile } from "@/types";

const COLUMNS = [
  { id: "status", title: "Status", type: "status" },
  { id: "tl", title: "Timeline", type: "timeline" },
  { id: "who", title: "Assignee", type: "people" },
];

function boardWith(statusLabels?: { label: string; color: string }[]): Board {
  return {
    id: "b1",
    name: "Studio A",
    description: "",
    columns: statusLabels
      ? ([{ ...COLUMNS[0], settings: { statusLabels } }, COLUMNS[1], COLUMNS[2]] as never)
      : (COLUMNS as never),
    items: [],
  } as unknown as Board;
}

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

const groups = [
  { id: "g1", title: "Phase 1" },
  { id: "g2", title: "Phase 2" },
] as unknown as Group[];

const profiles = [
  { id: "u1", full_name: "Amina" },
  { id: "u2", full_name: "Youness" },
] as unknown as Profile[];

/** A fixed "now" so nothing depends on the day the suite runs. */
const NOW = new Date(2026, 8, 15); // 15 Sep 2026, local

describe("done counting", () => {
  it("counts a French status as done", () => {
    // The regression this module exists for: the old dashboard compared against
    // the literal "Done", so an imported French board reported 0 completed.
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [item("a", { status: "Terminé" }), item("b", { status: "Not Started" })],
      profiles,
      NOW
    );
    expect(m.done).toBe(1);
    expect(m.donePct).toBe(50);
  });

  it("counts the other words boards use for finished", () => {
    const labels = ["Done", "Fait", "Achevée", "Completed"];
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      labels.map((l, i) => item(`i${i}`, { status: l })),
      profiles,
      NOW
    );
    expect(m.done).toBe(4);
  });

  it("puts an item with no status under one visible label", () => {
    // Otherwise the slices sum to less than the task count and the ring lies.
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [item("a", {}), item("b", { status: "Done" })],
      profiles,
      NOW
    );
    expect(m.statuses.reduce((n, s) => n + s.value, 0)).toBe(2);
  });
});

describe("overdue and due soon", () => {
  const dated = (id: string, end: string, status?: string) =>
    item(id, { tl: { start: "2026-01-01", end }, ...(status ? { status } : {}) });

  it("treats a task past its end date as overdue", () => {
    const m = computeDashboardMetrics(boardWith(), groups, [dated("a", "2026-09-14")], profiles, NOW);
    expect(m.overdue).toBe(1);
    expect(m.dueSoon).toBe(0);
  });

  it("does not call a finished task overdue", () => {
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [dated("a", "2026-09-01", "Terminé")],
      profiles,
      NOW
    );
    expect(m.overdue).toBe(0);
  });

  it("counts today as due soon, not overdue", () => {
    const m = computeDashboardMetrics(boardWith(), groups, [dated("a", "2026-09-15")], profiles, NOW);
    expect(m.overdue).toBe(0);
    expect(m.dueSoon).toBe(1);
  });

  it("covers seven days including today, and stops there", () => {
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [dated("in", "2026-09-21"), dated("out", "2026-09-22")],
      profiles,
      NOW
    );
    expect(m.dueSoon).toBe(1);
  });

  it("judges a timeline by its end, matching the automation engine", () => {
    // A task running Mon-Fri is not late until Friday has passed.
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [item("a", { tl: { start: "2026-09-01", end: "2026-09-20" } })],
      profiles,
      NOW
    );
    expect(m.overdue).toBe(0);
    expect(m.dueSoon).toBe(1);
  });

  it("reports undated tasks separately rather than hiding them", () => {
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [item("a", { status: "Not Started" })],
      profiles,
      NOW
    );
    expect(m.undated).toBe(1);
    expect(m.overdue + m.dueSoon).toBe(0);
  });
});

describe("status colours", () => {
  it("unwraps a Tailwind class to a hex", () => {
    expect(hexFromStatusColor("bg-[#00c875]")).toBe("#00c875");
  });

  it("refuses a gradient, which cannot be a chart fill", () => {
    expect(hexFromStatusColor("bg-gradient-to-r from-red-600 to-rose-600")).toBeNull();
  });

  it("prefers the board's own status labels over the defaults", () => {
    const m = computeDashboardMetrics(
      boardWith([{ label: "Terminé", color: "bg-[#123456]" }]),
      groups,
      [item("a", { status: "Terminé" })],
      profiles,
      NOW
    );
    expect(m.statuses[0].color).toBe("#123456");
  });
});

describe("breakdowns", () => {
  it("reads an assignee whichever shape the people cell uses", () => {
    const board = boardWith();
    expect(assigneeIdOf(board, item("a", { who: "u1" }))).toBe("u1");
    expect(assigneeIdOf(board, item("b", { who: ["u2"] }))).toBe("u2");
    expect(assigneeIdOf(board, item("c", { who: { id: "u1" } }))).toBe("u1");
    expect(assigneeIdOf(board, item("d", {}))).toBeNull();
  });

  it("names people and orders them by load", () => {
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [item("a", { who: ["u1"] }), item("b", { who: ["u1"] }), item("c", { who: ["u2"] })],
      profiles,
      NOW
    );
    expect(m.byAssignee.map((a) => [a.label, a.value])).toEqual([
      ["Amina", 2],
      ["Youness", 1],
    ]);
  });

  it("leaves out a group holding nothing", () => {
    const m = computeDashboardMetrics(boardWith(), groups, [item("a", {}, "g1")], profiles, NOW);
    expect(m.byGroup.map((g) => g.label)).toEqual(["Phase 1"]);
  });

  it("keys bars by identity, not row order", () => {
    // So a filter that removes one bar cannot repaint or re-key the survivors.
    const m = computeDashboardMetrics(boardWith(), groups, [item("a", {}, "g2")], profiles, NOW);
    expect(m.byGroup[0].key).toBe("g2");
  });
});

describe("dueDateOf", () => {
  it("returns null when nothing carries a date", () => {
    expect(dueDateOf(boardWith(), item("a", { status: "Done" }))).toBeNull();
  });

  it("reads a plain date string as a local day", () => {
    const board = {
      ...boardWith(),
      columns: [{ id: "d", title: "Due", type: "date" }],
    } as unknown as Board;
    const d = dueDateOf(board, item("a", { d: "2026-03-01" }))!;
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(1);
  });
});

describe("an absent board", () => {
  it("returns zeros rather than throwing", () => {
    const m = computeDashboardMetrics(null, [], [], [], NOW);
    expect(m.total).toBe(0);
    expect(m.statuses).toEqual([]);
  });
});
