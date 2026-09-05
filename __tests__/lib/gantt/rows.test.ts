import { describe, it, expect } from "vitest";
import type { Board, Column, Group, Item, Profile } from "@/types";
import {
  buildGanttRows,
  plotItemDates,
  GANTT_ROW_HEIGHTS,
  groupRowId,
  projectRowId,
  type GanttBoardContext,
  type GanttGroupRow,
  type GanttItemRow,
  type GanttProjectRow,
} from "@/lib/gantt/rows";
import { toDateOnly } from "@/lib/gantt/dates";

const TIMELINE: Column = { id: "col-timeline", title: "Works", type: "timeline" };
const DUE: Column = { id: "col-due", title: "Due", type: "date" };
const STATUS: Column = { id: "col-status", title: "Status", type: "status" };
const PEOPLE: Column = { id: "col-people", title: "Owner", type: "people" };
const FLAG: Column = { id: "col-flag", title: "Milestone", type: "checkbox" };

function board(id: string, name: string, columns: Column[] = [TIMELINE, STATUS], extra: Partial<Board> = {}): Board {
  return { id, name, description: "", columns, ...extra };
}

function group(id: string, title: string, boardId: string, position = 0, color = "#00c875"): Group {
  return { id, title, color, position, board_id: boardId };
}

function item(
  id: string,
  name: string,
  groupId: string,
  boardId: string,
  column_values: Record<string, any>,
  position = 0
): Item {
  return { id, name, group_id: groupId, board_id: boardId, column_values, position };
}

function span(start: string, end: string) {
  return { [TIMELINE.id]: { start, end } };
}

/** One board, one group, three tasks - the shape the board Gantt renders. */
function simpleContext(): GanttBoardContext {
  const b = board("b1", "Lancement");
  const g = group("g1", "Phase 1", "b1");
  return {
    board: b,
    groups: [g],
    items: [
      item("i1", "Permis", "g1", "b1", span("2026-03-01", "2026-03-10"), 0),
      item("i2", "Devis", "g1", "b1", span("2026-03-05", "2026-03-20"), 1),
      item("i3", "Travaux", "g1", "b1", span("2026-03-15", "2026-04-02"), 2),
    ],
  };
}

describe("plotItemDates", () => {
  it("reads a timeline span", () => {
    const b = board("b1", "B");
    const plotted = plotItemDates(item("i", "x", "g", "b1", span("2026-03-01", "2026-03-10")), b)!;
    expect(toDateOnly(plotted.start)).toBe("2026-03-01");
    expect(toDateOnly(plotted.end)).toBe("2026-03-10");
    expect(plotted.colType).toBe("timeline");
  });

  it("treats a date column as a single day", () => {
    const b = board("b1", "B", [DUE]);
    const plotted = plotItemDates(item("i", "x", "g", "b1", { [DUE.id]: "2026-03-01" }), b)!;
    expect(toDateOnly(plotted.start)).toBe("2026-03-01");
    expect(toDateOnly(plotted.end)).toBe("2026-03-01");
    expect(plotted.colType).toBe("date");
  });

  it("plots a timeline that has a start but no end yet", () => {
    const b = board("b1", "B");
    const plotted = plotItemDates(item("i", "x", "g", "b1", { [TIMELINE.id]: { start: "2026-03-01" } }), b)!;
    expect(toDateOnly(plotted.end)).toBe("2026-03-01");
  });

  it("never returns an end before its start", () => {
    const b = board("b1", "B");
    const plotted = plotItemDates(item("i", "x", "g", "b1", span("2026-03-10", "2026-03-01")), b)!;
    expect(plotted.end.getTime()).toBe(plotted.start.getTime());
  });

  it("returns null when the item carries no usable date", () => {
    const b = board("b1", "B");
    expect(plotItemDates(item("i", "x", "g", "b1", {}), b)).toBeNull();
    expect(plotItemDates(item("i", "x", "g", "b1", { [TIMELINE.id]: { end: "2026-03-01" } }), b)).toBeNull();
  });

  it("plots from the board's declared column, not whichever comes first", () => {
    // The old chart walked the column list and took the first non-empty hit, so
    // this item would have plotted from the "Due" column purely because it was
    // declared earlier on the board.
    const columns = [DUE, TIMELINE];
    const values = { [DUE.id]: "2026-01-01", ...span("2026-06-01", "2026-06-30") };

    const undeclared = plotItemDates(item("i", "x", "g", "b1", values), board("b1", "B", columns));
    expect(undeclared!.columnId).toBe(TIMELINE.id); // timeline wins the fallback

    const declared = plotItemDates(
      item("i", "x", "g", "b1", values),
      board("b1", "B", columns, { gantt_config: { timelineColumnId: DUE.id } })
    );
    expect(declared!.columnId).toBe(DUE.id);
    expect(toDateOnly(declared!.start)).toBe("2026-01-01");
  });

  it("falls back to another date column when the declared one is empty", () => {
    const b = board("b1", "B", [TIMELINE, DUE]);
    const plotted = plotItemDates(item("i", "x", "g", "b1", { [DUE.id]: "2026-02-02" }), b)!;
    expect(plotted.columnId).toBe(DUE.id);
  });
});

describe("row layout", () => {
  it("emits a group row followed by its items, with no project row by default", () => {
    const { rows } = buildGanttRows({ contexts: [simpleContext()] });
    expect(rows.map((r) => r.kind)).toEqual(["group", "item", "item", "item"]);
    expect(rows.map((r) => r.label)).toEqual(["Phase 1", "Permis", "Devis", "Travaux"]);
  });

  it("stacks y from the row heights so nothing has to re-derive it", () => {
    const { rows, totalHeight } = buildGanttRows({ contexts: [simpleContext()] });
    expect(rows.map((r) => r.y)).toEqual([
      0,
      GANTT_ROW_HEIGHTS.group,
      GANTT_ROW_HEIGHTS.group + GANTT_ROW_HEIGHTS.item,
      GANTT_ROW_HEIGHTS.group + GANTT_ROW_HEIGHTS.item * 2,
    ]);
    expect(totalHeight).toBe(GANTT_ROW_HEIGHTS.group + GANTT_ROW_HEIGHTS.item * 3);
  });

  it("rolls a group up to the span of its children", () => {
    const [groupRow] = buildGanttRows({ contexts: [simpleContext()] }).rows as GanttGroupRow[];
    expect(toDateOnly(groupRow.start)).toBe("2026-03-01");
    expect(toDateOnly(groupRow.end)).toBe("2026-04-02");
    expect(groupRow.itemCount).toBe(3);
  });

  it("orders groups and items by position, not by array order", () => {
    const b = board("b1", "B");
    const context: GanttBoardContext = {
      board: b,
      groups: [group("g2", "Second", "b1", 1), group("g1", "First", "b1", 0)],
      items: [
        item("i2", "B", "g1", "b1", span("2026-03-02", "2026-03-03"), 1),
        item("i1", "A", "g1", "b1", span("2026-03-01", "2026-03-02"), 0),
        item("i3", "C", "g2", "b1", span("2026-03-04", "2026-03-05"), 0),
      ],
    };
    expect(buildGanttRows({ contexts: [context] }).rows.map((r) => r.label)).toEqual([
      "First", "A", "B", "Second", "C",
    ]);
  });

  it("drops items with no dates, and groups left with nothing to draw", () => {
    const b = board("b1", "B");
    const context: GanttBoardContext = {
      board: b,
      groups: [group("g1", "Dated", "b1", 0), group("g2", "Undated", "b1", 1)],
      items: [
        item("i1", "A", "g1", "b1", span("2026-03-01", "2026-03-02")),
        item("i2", "No dates", "g1", "b1", {}),
        item("i3", "Also none", "g2", "b1", {}),
      ],
    };
    const { rows } = buildGanttRows({ contexts: [context] });
    expect(rows.map((r) => r.label)).toEqual(["Dated", "A"]);
  });
});

describe("collapsing", () => {
  it("keeps a collapsed group's row and its rolled-up span, but hides its items", () => {
    const { rows } = buildGanttRows({ contexts: [simpleContext()], collapsed: ["g1"] });
    expect(rows.map((r) => r.kind)).toEqual(["group"]);
    expect(rows[0].collapsed).toBe(true);
    expect(toDateOnly(rows[0].end)).toBe("2026-04-02");
  });

  it("still indexes the items inside a collapsed group so their arrows can be drawn", () => {
    const { byItemId, itemRows } = buildGanttRows({ contexts: [simpleContext()], collapsed: ["g1"] });
    expect(itemRows).toHaveLength(0);
    expect(byItemId.size).toBe(3);
    expect(byItemId.get("i2")!.label).toBe("Devis");
  });

  it("collapses a whole board down to its project row", () => {
    const { rows } = buildGanttRows({
      contexts: [simpleContext()],
      showProjectRows: true,
      collapsed: [projectRowId("b1")],
    });
    expect(rows.map((r) => r.kind)).toEqual(["project"]);
    expect((rows[0] as GanttProjectRow).itemCount).toBe(3);
  });
});

describe("milestones", () => {
  it("treats a zero-length timeline as a milestone", () => {
    const b = board("b1", "B");
    const context: GanttBoardContext = {
      board: b,
      groups: [group("g1", "G", "b1")],
      items: [
        item("i1", "Point", "g1", "b1", span("2026-03-01", "2026-03-01"), 0),
        item("i2", "Span", "g1", "b1", span("2026-03-01", "2026-03-05"), 1),
      ],
    };
    const { byItemId } = buildGanttRows({ contexts: [context] });
    expect(byItemId.get("i1")!.isMilestone).toBe(true);
    expect(byItemId.get("i2")!.isMilestone).toBe(false);
  });

  it("leaves a plain due date as a one-day bar", () => {
    // A `date` column is usually a deadline on ordinary work; turning every one
    // into a diamond would redraw boards that never asked for milestones.
    const b = board("b1", "B", [DUE]);
    const context: GanttBoardContext = {
      board: b,
      groups: [group("g1", "G", "b1")],
      items: [item("i1", "Due", "g1", "b1", { [DUE.id]: "2026-03-01" })],
    };
    expect(buildGanttRows({ contexts: [context] }).byItemId.get("i1")!.isMilestone).toBe(false);
  });

  it("honours a board's declared milestone checkbox", () => {
    const b = board("b1", "B", [TIMELINE, FLAG], { gantt_config: { milestoneColumnId: FLAG.id } });
    const context: GanttBoardContext = {
      board: b,
      groups: [group("g1", "G", "b1")],
      items: [
        item("i1", "Flagged", "g1", "b1", { ...span("2026-03-01", "2026-03-05"), [FLAG.id]: true }, 0),
        item("i2", "Not", "g1", "b1", { ...span("2026-03-01", "2026-03-05"), [FLAG.id]: false }, 1),
      ],
    };
    const { byItemId } = buildGanttRows({ contexts: [context] });
    expect(byItemId.get("i1")!.isMilestone).toBe(true);
    expect(byItemId.get("i2")!.isMilestone).toBe(false);
  });
});

describe("colours and assignees", () => {
  it("reads each item's status colour from its own board's palette", () => {
    // The Master Gantt used to resolve every bar against a merged pile of every
    // selected board's columns, so one board's palette coloured everyone's bars.
    const alphaStatus: Column = {
      ...STATUS,
      settings: { statusLabels: [{ label: "Live", color: "bg-[#111111]" }] },
    };
    const betaStatus: Column = {
      id: "col-status-beta",
      title: "Status",
      type: "status",
      settings: { statusLabels: [{ label: "Live", color: "bg-[#222222]" }] },
    };

    const contexts: GanttBoardContext[] = [
      {
        board: board("b1", "Alpha", [TIMELINE, alphaStatus]),
        groups: [group("g1", "G", "b1")],
        items: [item("i1", "A", "g1", "b1", { ...span("2026-03-01", "2026-03-02"), [alphaStatus.id]: "Live" })],
      },
      {
        board: board("b2", "Beta", [TIMELINE, betaStatus]),
        groups: [group("g2", "G", "b2")],
        items: [item("i2", "B", "g2", "b2", { ...span("2026-03-01", "2026-03-02"), [betaStatus.id]: "Live" })],
      },
    ];

    const { byItemId } = buildGanttRows({ contexts, showProjectRows: true });
    expect(byItemId.get("i1")!.statusColor).toBe("#111111");
    expect(byItemId.get("i2")!.statusColor).toBe("#222222");
  });

  it("names assignees, tolerating people values stored as JSON strings", () => {
    const profiles = [
      { id: "u1", full_name: "Amina" },
      { id: "u2", full_name: "Léo" },
    ] as Profile[];
    const b = board("b1", "B", [TIMELINE, PEOPLE]);
    const context: GanttBoardContext = {
      board: b,
      groups: [group("g1", "G", "b1")],
      items: [
        item("i1", "Array", "g1", "b1", { ...span("2026-03-01", "2026-03-02"), [PEOPLE.id]: ["u1", "u2"] }, 0),
        item("i2", "JSON string", "g1", "b1", { ...span("2026-03-01", "2026-03-02"), [PEOPLE.id]: '["u2"]' }, 1),
        item("i3", "Bare id", "g1", "b1", { ...span("2026-03-01", "2026-03-02"), [PEOPLE.id]: "u1" }, 2),
      ],
    };
    const { byItemId } = buildGanttRows({ contexts: [context], profiles });
    expect(byItemId.get("i1")!.assigneeNames).toBe("Amina, Léo");
    expect(byItemId.get("i2")!.assigneeNames).toBe("Léo");
    expect(byItemId.get("i3")!.assigneeNames).toBe("Amina");
  });
});

describe("portfolio swimlanes", () => {
  /** Two properties, each with a board called "Lancement" holding a group called "Phase 1". */
  function repeatedNames(): GanttBoardContext[] {
    return [
      {
        board: board("b1", "Lancement"),
        workspaceName: "Résidence Alpha",
        groups: [group("g1", "Phase 1", "b1")],
        items: [item("i1", "Permis", "g1", "b1", span("2026-03-01", "2026-03-10"))],
      },
      {
        board: board("b2", "Lancement"),
        workspaceName: "Résidence Beta",
        groups: [group("g2", "Phase 1", "b2")],
        items: [item("i2", "Permis", "g2", "b2", span("2026-05-01", "2026-05-20"))],
      },
    ];
  }

  it("gives each board its own lane instead of interleaving identically-named groups", () => {
    // Board names repeat by design - every property has a "Lancement" - so a flat
    // list sorted by group position made a row's project unidentifiable.
    const { rows } = buildGanttRows({ contexts: repeatedNames(), showProjectRows: true });
    expect(rows.map((r) => r.kind)).toEqual([
      "project", "group", "item",
      "project", "group", "item",
    ]);

    const [alpha, , , beta] = rows as GanttProjectRow[];
    expect(alpha.workspaceName).toBe("Résidence Alpha");
    expect(beta.workspaceName).toBe("Résidence Beta");
    expect(alpha.id).not.toBe(beta.id);
  });

  it("indents groups and items under their project row", () => {
    const { rows } = buildGanttRows({ contexts: repeatedNames(), showProjectRows: true });
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it("keeps depth flat when project rows are off", () => {
    const { rows } = buildGanttRows({ contexts: repeatedNames() });
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 0, 1]);
  });

  it("rolls a project up to the span of every group inside it", () => {
    const contexts = repeatedNames();
    contexts[0].groups.push(group("g1b", "Phase 2", "b1", 1));
    contexts[0].items.push(item("i1b", "Travaux", "g1b", "b1", span("2026-02-01", "2026-06-30")));

    const [project] = buildGanttRows({ contexts, showProjectRows: true }).rows as GanttProjectRow[];
    expect(toDateOnly(project.start)).toBe("2026-02-01");
    expect(toDateOnly(project.end)).toBe("2026-06-30");
    expect(project.itemCount).toBe(2);
  });

  it("keeps each row pointing at the board it came from", () => {
    const { rows } = buildGanttRows({ contexts: repeatedNames(), showProjectRows: true });
    const itemRows = rows.filter((r): r is GanttItemRow => r.kind === "item");
    expect(itemRows.map((r) => r.board.id)).toEqual(["b1", "b2"]);
    expect(rows.find((r) => r.kind === "group")!.id).toBe(groupRowId("g1"));
  });

  it("skips a board with nothing plottable rather than showing an empty lane", () => {
    const contexts = repeatedNames();
    contexts[1].items = [item("i2", "No dates", "g2", "b2", {})];
    const { rows } = buildGanttRows({ contexts, showProjectRows: true });
    expect(rows.filter((r) => r.kind === "project")).toHaveLength(1);
  });
});
