import { describe, it, expect } from "vitest";
import type { Board, Group, Item } from "@/types";
import {
  GANTT_FIELDS,
  DEFAULT_GANTT_FIELDS,
  normalizeFields,
  fieldsWidth,
  minPaneWidth,
  GANTT_FIELD_ORDER,
  type GanttFieldContext,
} from "@/lib/gantt/taskFields";
import { buildGanttRows, type GanttBoardContext } from "@/lib/gantt/rows";
import type { GanttDependency } from "@/lib/gantt/dependencies";

const TIMELINE = { id: "t", title: "Works", type: "timeline" as const };
const board: Board = { id: "b1", name: "Lancement", description: "", columns: [TIMELINE] };
const group: Group = { id: "g1", title: "Phase 1", color: "#00c875", position: 0, board_id: "b1" };

function task(id: string, name: string, start: string, end: string, position: number): Item {
  return {
    id, name, group_id: "g1", board_id: "b1", position,
    column_values: { [TIMELINE.id]: { start, end } },
  };
}

const items = [
  task("i1", "Permis", "2026-03-02", "2026-03-06", 0),
  task("i2", "Devis", "2026-03-09", "2026-03-13", 1),
];

const contexts: GanttBoardContext[] = [
  { board, groups: [group], items, workspaceName: "Résidence Alpha" },
];

const dependencies: GanttDependency[] = [
  { id: "l1", sourceId: "i1", targetId: "i2", type: "FS", lag: 0 },
];

function context(overrides: Partial<GanttFieldContext> = {}): GanttFieldContext {
  return {
    dependencies,
    nameById: new Map([["i1", "Permis"], ["i2", "Devis"]]),
    ...overrides,
  };
}

const rowsOf = (showProjectRows = false) =>
  buildGanttRows({ contexts, showProjectRows }).rows;

describe("field values", () => {
  it("reads dates and duration off a task", () => {
    const row = rowsOf().find((r) => r.kind === "item" && r.label === "Permis")!;
    expect(GANTT_FIELDS.start.value(row, context())).toBe("2 Mar 26");
    expect(GANTT_FIELDS.finish.value(row, context())).toBe("6 Mar 26");
    // Inclusive: Mar 2 to Mar 6 is five days of work.
    expect(GANTT_FIELDS.duration.value(row, context())).toBe("5");
  });

  it("rolls a summary row up over its children", () => {
    const row = rowsOf().find((r) => r.kind === "group")!;
    expect(GANTT_FIELDS.start.value(row, context())).toBe("2 Mar 26");
    expect(GANTT_FIELDS.finish.value(row, context())).toBe("13 Mar 26");
    expect(GANTT_FIELDS.duration.value(row, context())).toBe("12");
  });

  it("names a lane by its workspace and board together", () => {
    // "Lancement" alone identifies nothing; every property has one.
    const row = rowsOf(true).find((r) => r.kind === "project")!;
    expect(GANTT_FIELDS.name.value(row, context())).toBe("Résidence Alpha › Lancement");
  });

  it("names what a task is waiting on", () => {
    const row = rowsOf().find((r) => r.kind === "item" && r.label === "Devis")!;
    expect(GANTT_FIELDS.predecessors.value(row, context())).toBe("Permis");
  });

  it("spells out a link that is not a plain finish-to-start", () => {
    const row = rowsOf().find((r) => r.kind === "item" && r.label === "Devis")!;
    expect(
      GANTT_FIELDS.predecessors.value(
        row,
        context({ dependencies: [{ id: "l", sourceId: "i1", targetId: "i2", type: "SS", lag: 3 }] })
      )
    ).toBe("Permis (SS +3d)");
    expect(
      GANTT_FIELDS.predecessors.value(
        row,
        context({ dependencies: [{ id: "l", sourceId: "i1", targetId: "i2", type: "FS", lag: -2 }] })
      )
    ).toBe("Permis (FS -2d)");
  });

  it("leaves predecessors blank on a summary row", () => {
    const row = rowsOf().find((r) => r.kind === "group")!;
    expect(GANTT_FIELDS.predecessors.value(row, context())).toBe("");
  });

  it("reports slack, and says so when a task is in a loop", () => {
    const row = rowsOf().find((r) => r.kind === "item")!;
    const base = { id: "i1", duration: 5, earlyStart: 0, earlyFinish: 4, lateStart: 3, lateFinish: 7 };

    expect(
      GANTT_FIELDS.float.value(row, context({ schedule: { ...base, totalFloat: 3, isCritical: false, inCycle: false } }))
    ).toBe("3");
    expect(
      GANTT_FIELDS.float.value(row, context({ schedule: { ...base, totalFloat: 0, isCritical: true, inCycle: false } }))
    ).toBe("0");
    expect(
      GANTT_FIELDS.float.value(row, context({ schedule: { ...base, totalFloat: 0, isCritical: false, inCycle: true } }))
    ).toBe("loop");
    // Nothing to say without a computed schedule.
    expect(GANTT_FIELDS.float.value(row, context())).toBe("");
  });
});

describe("normalizeFields", () => {
  it("falls back to the defaults for an empty or unusable list", () => {
    expect(normalizeFields([])).toEqual(DEFAULT_GANTT_FIELDS);
    expect(normalizeFields(undefined)).toEqual(DEFAULT_GANTT_FIELDS);
    expect(normalizeFields(["nonsense", "gone"])).toEqual(DEFAULT_GANTT_FIELDS);
  });

  it("always keeps the name, which is what identifies the row", () => {
    expect(normalizeFields(["start", "finish"])).toEqual(["name", "start", "finish"]);
  });

  it("drops unknown keys and duplicates", () => {
    expect(normalizeFields(["duration", "name", "duration", "bogus"])).toEqual([
      "name",
      "duration",
    ]);
  });

  it("puts the columns in a fixed order, not the order they were ticked", () => {
    // Otherwise turning a column on appends it to the end, and the table stops
    // matching the order the menu shows.
    expect(normalizeFields(["predecessors", "start", "name"])).toEqual([
      "name",
      "start",
      "predecessors",
    ]);
  });
});

describe("pane sizing", () => {
  it("adds up the fixed widths", () => {
    expect(fieldsWidth(["duration", "float"])).toBe(
      GANTT_FIELDS.duration.width + GANTT_FIELDS.float.width
    );
  });

  it("demands more room for every column added", () => {
    // Turning a column on has to widen the pane; squeezing the task names into
    // an ellipsis instead loses the only thing that says which row you are on.
    const few = minPaneWidth(["name", "start"]);
    const many = minPaneWidth(["name", "start", "finish", "duration", "predecessors"]);
    expect(many).toBeGreaterThan(few);
  });

  it("still leaves the name room when every column is on", () => {
    const width = minPaneWidth(GANTT_FIELD_ORDER);
    const fixed = fieldsWidth(GANTT_FIELD_ORDER) - GANTT_FIELDS.name.width;
    expect(width - fixed).toBeGreaterThanOrEqual(140);
  });
});
