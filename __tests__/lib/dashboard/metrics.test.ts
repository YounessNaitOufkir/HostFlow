import { describe, it, expect } from "vitest";
import {
  computeDashboardMetrics,
  dueDateOf,
  assigneeIdOf,
  ASSIGNEE_BAR_COLOR,
  ATTENTION_LIMIT,
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

  it("gives the built-in Overdue status its red rather than neutral grey", () => {
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [item("a", { status: "Overdue" })],
      profiles,
      NOW
    );
    expect(m.statuses[0].color).not.toBe("#c4c4c4");
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

describe("working and stuck, in either language", () => {
  it("counts the French words too", () => {
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [
        item("a", { status: "En cours" }),
        item("b", { status: "Working on it" }),
        item("c", { status: "Bloqué" }),
        item("d", { status: "Stuck" }),
      ],
      profiles,
      NOW
    );
    expect(m.working).toBe(2);
    expect(m.stuck).toBe(2);
  });

  it("does not let a finished task also count as working", () => {
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [item("a", { status: "Terminé" })],
      profiles,
      NOW
    );
    expect(m.done).toBe(1);
    expect(m.working).toBe(0);
    expect(m.stuck).toBe(0);
  });
});

describe("bar colours", () => {
  it("gives each group the colour the board gives it", () => {
    const coloured = [
      { id: "g1", title: "Phase 1", color: "#579bfc" },
      { id: "g2", title: "Phase 2", color: "#00c875" },
    ] as unknown as Group[];
    const m = computeDashboardMetrics(
      boardWith(),
      coloured,
      [item("a", {}, "g1"), item("b", {}, "g2")],
      profiles,
      NOW
    );
    expect(m.byGroup.map((g) => g.color).sort()).toEqual(["#00c875", "#579bfc"]);
  });

  it("gives every assignee the same restrained hue", () => {
    // Their name is already on the row, so a colour per person would be
    // decoration - and a muted palette that far apart fails the separation floor.
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [item("a", { who: ["u1"] }), item("b", { who: ["u2"] })],
      profiles,
      NOW
    );
    expect(new Set(m.byAssignee.map((a) => a.color))).toEqual(new Set([ASSIGNEE_BAR_COLOR]));
  });
});

describe("the attention list", () => {
  const dated = (id: string, end: string, extra: Record<string, unknown> = {}) =>
    item(id, { tl: { start: "2026-01-01", end }, ...extra });

  it("puts the latest task first and the furthest out last", () => {
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [dated("soon", "2026-09-18"), dated("late", "2026-09-10"), dated("today", "2026-09-15")],
      profiles,
      NOW
    );
    expect(m.attention.map((a) => a.id)).toEqual(["late", "today", "soon"]);
    expect(m.attention[0].offsetDays).toBe(-5);
    expect(m.attention[1].offsetDays).toBe(0);
  });

  it("leaves out anything finished or further out than the window", () => {
    const m = computeDashboardMetrics(
      boardWith(),
      groups,
      [
        dated("done", "2026-09-01", { status: "Terminé" }),
        dated("far", "2026-12-01"),
        dated("in", "2026-09-16"),
      ],
      profiles,
      NOW
    );
    expect(m.attention.map((a) => a.id)).toEqual(["in"]);
  });

  it("caps the rows but still reports the true total", () => {
    const many = Array.from({ length: 12 }, (_, i) => dated("t" + i, "2026-09-16"));
    const m = computeDashboardMetrics(boardWith(), groups, many, profiles, NOW);
    expect(m.attention).toHaveLength(ATTENTION_LIMIT);
    expect(m.attentionTotal).toBe(12);
  });

  it("carries the group colour and the owner so the row can be read alone", () => {
    const coloured = [{ id: "g1", title: "Travaux", color: "#579bfc" }] as unknown as Group[];
    const m = computeDashboardMetrics(
      boardWith(),
      coloured,
      [dated("a", "2026-09-16", { who: ["u1"] })],
      profiles,
      NOW
    );
    expect(m.attention[0].groupTitle).toBe("Travaux");
    expect(m.attention[0].groupColor).toBe("#579bfc");
    expect(m.attention[0].ownerName).toBe("Amina");
  });

  it("reports no owner rather than inventing one", () => {
    const m = computeDashboardMetrics(boardWith(), groups, [dated("a", "2026-09-16")], profiles, NOW);
    expect(m.attention[0].ownerName).toBeNull();
  });
});

describe("an absent board", () => {
  it("returns zeros rather than throwing", () => {
    const m = computeDashboardMetrics(null, [], [], [], NOW);
    expect(m.total).toBe(0);
    expect(m.statuses).toEqual([]);
  });
});

describe("a board with its own vocabulary", () => {
  // Every label here is one no pattern would recognise, which is the point:
  // the board declared what they mean and the dashboard has to read that.
  const labels = [
    { label: "On site", color: "bg-[#fdab3d]", semantic: "working" },
    { label: "Signed off", color: "bg-[#00c875]", semantic: "done" },
    { label: "Waiting on client", color: "bg-[#e2445c]", semantic: "stuck" },
  ] as never;

  it("counts work in progress the board calls something else", () => {
    // The regression: these three tiles were computed from the bare status
    // string, so a board saying "On site" reported nothing in progress.
    const m = computeDashboardMetrics(
      boardWith(labels),
      groups,
      [
        item("a", { status: "On site" }),
        item("b", { status: "On site" }),
        item("c", { status: "Signed off" }),
        item("d", { status: "Waiting on client" }),
      ],
      profiles,
      NOW
    );
    expect(m.working).toBe(2);
    expect(m.done).toBe(1);
    expect(m.stuck).toBe(1);
    expect(m.total).toBe(4);
  });

  it("does not count a finished task as overdue", () => {
    const m = computeDashboardMetrics(
      boardWith(labels),
      groups,
      [
        item("done-late", { status: "Signed off", tl: { start: "2026-08-01", end: "2026-08-10" } }),
        item("still-late", { status: "On site", tl: { start: "2026-08-01", end: "2026-08-10" } }),
      ],
      profiles,
      NOW
    );
    expect(m.overdue).toBe(1);
  });
});
