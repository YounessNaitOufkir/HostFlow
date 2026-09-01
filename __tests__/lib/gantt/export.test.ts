import { describe, it, expect } from "vitest";
import type { Board, Group, Item } from "@/types";
import {
  renderGanttSvg,
  ganttToTable,
  GANTT_TABLE_HEADERS,
  slugify,
} from "@/lib/gantt/export";
import { buildGanttRows, type GanttBoardContext } from "@/lib/gantt/rows";
import { createGanttScale, ganttBounds } from "@/lib/gantt/scale";
import { collectDependencies } from "@/lib/gantt/dependencies";
import { computeSchedule } from "@/lib/gantt/schedule";
import { parseDateOnly, dayIndex } from "@/lib/gantt/dates";

const TIMELINE = { id: "col-timeline", title: "Works", type: "timeline" as const };

const board: Board = {
  id: "b1",
  name: "Lancement",
  description: "",
  columns: [TIMELINE],
};

const group: Group = {
  id: "g1",
  title: "Phase 1",
  color: "#00c875",
  position: 0,
  board_id: "b1",
};

function task(id: string, name: string, start: string, end: string, position: number): Item {
  return {
    id,
    name,
    group_id: "g1",
    board_id: "b1",
    position,
    column_values: { [TIMELINE.id]: { start, end } },
  };
}

const items = [
  task("i1", "Permis de construire", "2026-03-02", "2026-03-06", 0),
  task("i2", "Devis <charpente>", "2026-03-09", "2026-03-13", 1),
  task("i3", "Réunion", "2026-03-16", "2026-03-16", 2),
];

const contexts: GanttBoardContext[] = [{ board, groups: [group], items }];

const links = [
  {
    id: "l1",
    source_item_id: "i1",
    target_item_id: "i2",
    link_type: "dependency" as const,
    dep_type: "FS" as const,
    lag_days: 2,
    created_at: "2026-01-01T00:00:00Z",
  },
];

function build(showProjectRows = false) {
  const model = buildGanttRows({ contexts, showProjectRows });
  const { chartStart, chartEnd } = ganttBounds(model.starts, model.ends, "day");
  const scale = createGanttScale({ zoom: "day", chartStart, chartEnd });
  const dependencies = collectDependencies(items, new Map([[board.id, board]]), links);
  const schedule = computeSchedule(
    Array.from(model.byItemId.values()).map((r) => ({
      id: r.item.id,
      start: dayIndex(r.start),
      end: dayIndex(r.end),
    })),
    dependencies
  );
  return { model, scale, dependencies, schedule };
}

function svg(overrides: Partial<Parameters<typeof renderGanttSvg>[0]> = {}) {
  const { model, scale, dependencies, schedule } = build();
  return renderGanttSvg({
    rows: model.rows,
    dependencies,
    scale,
    title: "Lancement",
    colorBy: "group",
    schedules: schedule.tasks,
    criticalIds: schedule.criticalIds,
    violatedDependencyIds: new Set(schedule.violations.map((v) => v.dependencyId)),
    highlightCritical: false,
    ...overrides,
  });
}

describe("renderGanttSvg", () => {
  it("produces a standalone SVG document", () => {
    const output = svg();
    expect(output.startsWith("<svg xmlns=")).toBe(true);
    expect(output.endsWith("</svg>")).toBe(true);
    // Nothing external: that is what keeps the canvas untainted so a PNG is possible.
    expect(output).not.toMatch(/<image|xlink:href|url\(http/);
  });

  it("is exactly as wide as the task column plus the timeline", () => {
    const { scale } = build();
    const output = svg({ taskColumnWidth: 300 });
    const width = Number(/width="(\d+(?:\.\d+)?)"/.exec(output)![1]);
    expect(width).toBe(300 + scale.width);
  });

  it("draws the whole plan, not just what would be on screen", () => {
    // The reason exports redraw rather than screenshot: the live chart only
    // mounts the rows in the viewport.
    const output = svg();
    for (const item of items) {
      expect(output).toContain(escapeForSvg(item.name.slice(0, 8)));
    }
  });

  it("escapes text that would otherwise break the document", () => {
    const output = svg();
    expect(output).toContain("Devis &lt;charpente&gt;");
    expect(output).not.toContain("<charpente>");
  });

  it("parses as well-formed XML", () => {
    // A browser will not rasterise a malformed SVG, and the failure is silent -
    // the image simply never loads - so unescaped task names would break the
    // PNG and PDF exports with nothing to show for it.
    const document = new DOMParser().parseFromString(svg(), "image/svg+xml");
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.documentElement.tagName).toBe("svg");
    expect(document.querySelectorAll("rect").length).toBeGreaterThan(0);
  });

  it("stays well-formed with names full of XML metacharacters", () => {
    const hostile = items.map((item, i) => ({
      ...item,
      name: `<a href="x">&${i}</a> 'quoted' "double"`,
    }));
    const model = buildGanttRows({ contexts: [{ board, groups: [group], items: hostile }] });
    const { chartStart, chartEnd } = ganttBounds(model.starts, model.ends, "day");
    const output = renderGanttSvg({
      rows: model.rows,
      dependencies: [],
      scale: createGanttScale({ zoom: "day", chartStart, chartEnd }),
      title: `<script>alert(1)</script>`,
      colorBy: "group",
      schedules: new Map(),
      criticalIds: new Set(),
      violatedDependencyIds: new Set(),
      highlightCritical: false,
    });

    const document = new DOMParser().parseFromString(output, "image/svg+xml");
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });

  it("draws a milestone as a diamond and a task as a bar", () => {
    const output = svg();
    expect(output).toContain("<polygon");
    expect(output).toMatch(/<rect[^>]+rx="3"/);
  });

  it("labels a swimlane with its workspace when there is one", () => {
    const model = buildGanttRows({
      contexts: [{ ...contexts[0], workspaceName: "Résidence Alpha" }],
      showProjectRows: true,
    });
    const { chartStart, chartEnd } = ganttBounds(model.starts, model.ends, "day");
    const output = renderGanttSvg({
      rows: model.rows,
      dependencies: [],
      scale: createGanttScale({ zoom: "day", chartStart, chartEnd }),
      title: "Master",
      colorBy: "group",
      schedules: new Map(),
      criticalIds: new Set(),
      violatedDependencyIds: new Set(),
      highlightCritical: false,
    });
    expect(output).toContain("Résidence Alpha › Lancement");
  });

  it("paints the critical chain only when asked", () => {
    const plain = svg({ highlightCritical: false });
    const highlighted = svg({
      highlightCritical: true,
      criticalIds: new Set(["i1", "i2"]),
    });
    expect(highlighted.split("#e2445c").length).toBeGreaterThan(
      plain.split("#e2445c").length
    );
  });

  it("draws one arrow per dependency", () => {
    const output = svg();
    expect(output.match(/<polygon points="[^"]+" fill="#94a3b8"/g)).toHaveLength(1);
  });
});

describe("ganttToTable", () => {
  it("has a cell for every header on every row", () => {
    const { model, dependencies, schedule } = build();
    const table = ganttToTable(model.rows, dependencies, schedule.tasks);
    expect(table.length).toBe(model.rows.length);
    for (const row of table) {
      expect(row).toHaveLength(GANTT_TABLE_HEADERS.length);
    }
  });

  it("writes dates a spreadsheet will sort correctly", () => {
    const { model, dependencies, schedule } = build();
    const table = ganttToTable(model.rows, dependencies, schedule.tasks);
    const permis = table.find((r) => r[4] === "Permis de construire")!;
    expect(permis[5]).toBe("2026-03-02");
    expect(permis[6]).toBe("2026-03-06");
    expect(permis[7]).toBe(5);
  });

  it("names predecessors, with their type and lag", () => {
    const { model, dependencies, schedule } = build();
    const table = ganttToTable(model.rows, dependencies, schedule.tasks);
    const devis = table.find((r) => r[4] === "Devis <charpente>")!;
    expect(devis[12]).toBe("Permis de construire (FS+2d)");
  });

  it("marks a milestone", () => {
    const { model, dependencies, schedule } = build();
    const table = ganttToTable(model.rows, dependencies, schedule.tasks);
    expect(table.find((r) => r[4] === "Réunion")![8]).toBe("yes");
  });

  it("carries float and criticality through", () => {
    const { model, dependencies, schedule } = build();
    const table = ganttToTable(model.rows, dependencies, schedule.tasks);
    const permis = table.find((r) => r[4] === "Permis de construire")!;
    expect(typeof permis[10]).toBe("number");
  });

  it("includes the summary rows, with no task-only fields filled in", () => {
    const { model, dependencies, schedule } = build();
    const table = ganttToTable(model.rows, dependencies, schedule.tasks);
    const groupRow = table.find((r) => r[0] === "group")!;
    expect(groupRow[3]).toBe("Phase 1");
    expect(groupRow[8]).toBe("");
  });
});

describe("slugify", () => {
  it("makes a filename out of a board name", () => {
    expect(slugify("Résidence Alpha › Lancement")).toBe("residence-alpha-lancement");
  });

  it("falls back rather than producing an empty filename", () => {
    expect(slugify("›››")).toBe("gantt");
    expect(slugify("")).toBe("gantt");
  });

  it("keeps a filename to a sensible length", () => {
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

function escapeForSvg(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
