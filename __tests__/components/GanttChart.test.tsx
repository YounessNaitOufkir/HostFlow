import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { Board, Column, Group, Item, ItemLink } from "@/types";
import GanttChart from "@/components/gantt/GanttChart";
import { createGanttScale, ganttBounds, PX_PER_DAY } from "@/lib/gantt/scale";
import { parseDateOnly } from "@/lib/gantt/dates";
import type { GanttBoardContext } from "@/lib/gantt/rows";

const TIMELINE: Column = { id: "col-timeline", title: "Works", type: "timeline" };
const DEP: Column = { id: "col-dep", title: "Depends on", type: "dependency" };

const board: Board = {
  id: "b1",
  name: "Lancement",
  description: "",
  columns: [TIMELINE, DEP],
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

/** Permis runs Mar 2–6, Devis Mar 9–13 and depends on it, Reunion is a one-day milestone. */
const items: Item[] = [
  task("i1", "Permis", "2026-03-02", "2026-03-06", 0),
  task("i2", "Devis", "2026-03-09", "2026-03-13", 1),
  task("i3", "Reunion", "2026-03-16", "2026-03-16", 2),
];

const itemLinks: ItemLink[] = [
  {
    id: "l1",
    source_item_id: "i1",
    target_item_id: "i2",
    link_type: "dependency",
    dep_type: "FS",
    lag_days: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const contexts: GanttBoardContext[] = [{ board, groups: [group], items }];

function renderChart(overrides: Partial<React.ComponentProps<typeof GanttChart>> = {}) {
  return render(
    <GanttChart
      contexts={contexts}
      itemLinks={itemLinks}
      collapsed={new Set()}
      onToggleCollapse={() => {}}
      storageKey="test"
      {...overrides}
    />
  );
}

/** The scale the chart builds for itself at a given zoom, to check its output against. */
function expectedScale(zoom: "day" | "week" | "month" | "quarter") {
  const starts = items.map((i) => parseDateOnly(i.column_values[TIMELINE.id].start)!);
  const ends = items.map((i) => parseDateOnly(i.column_values[TIMELINE.id].end)!);
  const { chartStart, chartEnd } = ganttBounds(starts, ends, zoom);
  return createGanttScale({ zoom, chartStart, chartEnd });
}

const bar = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });
const px = (value: string) => parseFloat(value);

// The chart remembers its zoom per storage key, so without this a test that
// switches zoom hands its choice to the next one.
beforeEach(() => {
  localStorage.clear();
});

describe("GanttChart geometry", () => {
  it("places every bar at the pixel its dates resolve to", () => {
    renderChart();
    const scale = expectedScale("day");

    for (const item of items.slice(0, 2)) {
      const start = parseDateOnly(item.column_values[TIMELINE.id].start)!;
      const end = parseDateOnly(item.column_values[TIMELINE.id].end)!;
      const element = bar(item.name);

      expect(px(element.style.left)).toBeCloseTo(scale.xOf(start), 3);
      expect(px(element.style.width)).toBeCloseTo(scale.widthOf(start, end), 3);
    }
  });

  it("sizes a five-day task five columns wide", () => {
    renderChart();
    // Mar 2 to Mar 6 inclusive is five days of work.
    expect(px(bar("Permis").style.width)).toBeCloseTo(5 * PX_PER_DAY.day, 3);
  });

  it("lands the dependency arrow exactly on the bar it leaves", () => {
    // The defect this covers: bars were positioned as a percentage of the
    // rendered track while the arrow layer used raw pixels at a hard-coded
    // 50px/day. They agreed only when the track happened to be exactly
    // totalDays * 50 wide; on any wider viewport the bars spread out and the
    // arrows stayed behind, pointing at nothing.
    const { container } = renderChart();
    const scale = expectedScale("day");

    const path = container.querySelector("svg path[marker-end]");
    expect(path).not.toBeNull();

    const [, startX] = /^M ([\d.-]+) ([\d.-]+)/.exec(path!.getAttribute("d")!)!;
    const source = bar("Permis");
    const sourceRight = px(source.style.left) + px(source.style.width);

    expect(parseFloat(startX)).toBeCloseTo(sourceRight, 3);
    // And the same edge is where the scale says the task finishes.
    expect(parseFloat(startX)).toBeCloseTo(scale.xOf(parseDateOnly("2026-03-07")!), 3);
  });

  it("keeps bars and arrows together at every zoom", async () => {
    const user = userEvent.setup();
    const { container } = renderChart();

    for (const zoom of ["Week", "Month", "Quarter", "Day"] as const) {
      await user.click(screen.getByRole("button", { name: zoom }));

      const source = bar("Permis");
      const sourceRight = px(source.style.left) + px(source.style.width);
      const path = container.querySelector("svg path[marker-end]");
      const [, startX] = /^M ([\d.-]+) ([\d.-]+)/.exec(path!.getAttribute("d")!)!;

      expect(parseFloat(startX)).toBeCloseTo(sourceRight, 3);
    }
  });

  it("rescales every bar when the zoom changes", async () => {
    const user = userEvent.setup();
    renderChart();

    const atDay = px(bar("Permis").style.width);
    await user.click(screen.getByRole("button", { name: "Month" }));
    const atMonth = px(bar("Permis").style.width);

    expect(atMonth).toBeLessThan(atDay);
    expect(atMonth).toBeCloseTo(5 * PX_PER_DAY.month, 3);
  });

  it("never collapses a bar to nothing at the widest zoom", async () => {
    const user = userEvent.setup();
    renderChart();
    await user.click(screen.getByRole("button", { name: "Quarter" }));

    for (const name of ["Permis", "Devis"]) {
      expect(px(bar(name).style.width)).toBeGreaterThanOrEqual(PX_PER_DAY.quarter);
    }
  });
});

describe("GanttChart rows", () => {
  it("draws a summary bar for the group whether or not it is collapsed", () => {
    // The old chart only drew one while collapsed, throwing away the one thing
    // the row is there to say: when the phase starts and when it ends.
    const { container, rerender } = renderChart();
    const scale = expectedScale("day");
    const summaryOf = () => container.querySelector('[data-testid="gantt-summary-bar"]');

    expect(summaryOf()).not.toBeNull();
    expect(px((summaryOf() as HTMLElement).style.left)).toBeCloseTo(
      scale.xOf(parseDateOnly("2026-03-02")!),
      3
    );

    rerender(
      <GanttChart
        contexts={contexts}
        itemLinks={itemLinks}
        collapsed={new Set(["g1"])}
        onToggleCollapse={() => {}}
        storageKey="test"
      />
    );
    expect(summaryOf()).not.toBeNull();
  });

  it("renders a zero-length timeline as a milestone rather than a one-day bar", () => {
    renderChart();
    expect(
      screen.getByRole("button", { name: /^Milestone: Reunion/ })
    ).toBeInTheDocument();
  });

  it("hides a collapsed group's tasks but keeps the group", () => {
    renderChart({ collapsed: new Set(["g1"]) });
    expect(screen.queryByRole("button", { name: /^Permis,/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 1/ })).toBeInTheDocument();
  });
});

describe("GanttChart linking", () => {
  const handles = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[title^="Drag to link"]')) as HTMLElement[];

  /**
   * Drag from a handle to a point over another bar. jsdom reports every element
   * as zero-sized, so the target point is computed from the chart's own scale —
   * the same numbers the component hit-tests against.
   */
  function dragLink(
    container: HTMLElement,
    handleIndex: number,
    target: { name: string; half: "start" | "finish" }
  ) {
    const scale = expectedScale("day");
    const item = items.find((i) => i.name === target.name)!;
    const start = parseDateOnly(item.column_values[TIMELINE.id].start)!;
    const end = parseDateOnly(item.column_values[TIMELINE.id].end)!;
    const left = scale.xOf(start);
    const width = scale.widthOf(start, end);
    const x = target.half === "start" ? left + width * 0.25 : left + width * 0.75;

    const row = screen.getByRole("button", { name: new RegExp(`^${target.name},`) })
      .parentElement as HTMLElement;
    const y = parseFloat(row.style.top) + parseFloat(row.style.height) / 2;

    fireEvent.pointerDown(handles(container)[handleIndex], { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: x, clientY: y });
    fireEvent.pointerUp(window);
  }

  /** Handle order is DOM order: each task's start then its finish. */
  const PERMIS_START = 0;
  const PERMIS_FINISH = 1;
  const DEVIS_FINISH = 3;

  it("shows no link handles unless links can be made", () => {
    expect(handles(renderChart().container)).toHaveLength(0);
  });

  it("puts a handle on each end of every task bar", () => {
    // Two real tasks, two ends each. The milestone has none: a point in time
    // has no distinct start and finish to drag between.
    expect(handles(renderChart({ onCreateLink: () => {} }).container)).toHaveLength(4);
  });

  it("reads the link type off the two ends the drag joined", () => {
    const created: { sourceId: string; targetId: string; type: string }[] = [];
    const { container } = renderChart({
      itemLinks: [],
      onCreateLink: (l) => created.push(l),
    });

    // Out of Permis's finish, into the left half of Devis.
    dragLink(container, PERMIS_FINISH, { name: "Devis", half: "start" });
    expect(created).toEqual([{ sourceId: "i1", targetId: "i2", type: "FS" }]);
  });

  it("makes a finish-to-finish link when the drag lands on a finish", () => {
    const created: { type: string }[] = [];
    const { container } = renderChart({ itemLinks: [], onCreateLink: (l) => created.push(l) });
    dragLink(container, PERMIS_FINISH, { name: "Devis", half: "finish" });
    expect(created[0].type).toBe("FF");
  });

  it("makes a start-to-start link when both ends are starts", () => {
    const created: { type: string }[] = [];
    const { container } = renderChart({ itemLinks: [], onCreateLink: (l) => created.push(l) });
    dragLink(container, PERMIS_START, { name: "Devis", half: "start" });
    expect(created[0].type).toBe("SS");
  });

  it("refuses a pair that is already linked", () => {
    // The fixture already runs Permis into Devis.
    const created: unknown[] = [];
    const { container } = renderChart({ onCreateLink: (l) => created.push(l) });
    dragLink(container, PERMIS_FINISH, { name: "Devis", half: "start" });
    expect(created).toHaveLength(0);
  });

  it("refuses a link that would close a loop", () => {
    // Permis already drives Devis, so Devis back into Permis is a circle - and
    // a plan with a loop has no order for the scheduler to find.
    const created: unknown[] = [];
    const { container } = renderChart({ onCreateLink: (l) => created.push(l) });
    dragLink(container, DEVIS_FINISH, { name: "Permis", half: "start" });
    expect(created).toHaveLength(0);
  });

  it("does nothing when the drag is released over empty space", () => {
    const created: unknown[] = [];
    const { container } = renderChart({ itemLinks: [], onCreateLink: (l) => created.push(l) });

    fireEvent.pointerDown(handles(container)[PERMIS_FINISH], { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 4000, clientY: 4000 });
    fireEvent.pointerUp(window);

    expect(created).toHaveLength(0);
  });

  it("will not link a task to itself", () => {
    const created: unknown[] = [];
    const { container } = renderChart({ itemLinks: [], onCreateLink: (l) => created.push(l) });
    dragLink(container, PERMIS_FINISH, { name: "Permis", half: "start" });
    expect(created).toHaveLength(0);
  });

  it("opens an editor for an arrow, with its two tasks named", async () => {
    const user = userEvent.setup();
    const { container } = renderChart({ onUpdateLink: () => {}, onDeleteLink: () => {} });

    await user.click(container.querySelector('svg path[stroke="transparent"]')!);

    const editor = screen.getByRole("dialog", { name: "Dependency" });
    expect(within(editor).getByText("Permis")).toBeInTheDocument();
    expect(within(editor).getByText("Devis")).toBeInTheDocument();
    expect(within(editor).getByRole("button", { name: "FS" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("changes a link's type from the editor", async () => {
    const user = userEvent.setup();
    const changes: [string, { type?: string; lag?: number }][] = [];
    const { container } = renderChart({
      onUpdateLink: (id, c) => changes.push([id, c]),
      onDeleteLink: () => {},
    });

    await user.click(container.querySelector('svg path[stroke="transparent"]')!);
    await user.click(screen.getByRole("button", { name: "SS" }));

    expect(changes).toEqual([["l1", { type: "SS" }]]);
  });

  it("takes a lag, and holds it to whole days", async () => {
    const user = userEvent.setup();
    const changes: [string, { type?: string; lag?: number }][] = [];
    const { container } = renderChart({
      onUpdateLink: (id, c) => changes.push([id, c]),
      onDeleteLink: () => {},
    });

    await user.click(container.querySelector('svg path[stroke="transparent"]')!);
    const lag = screen.getByLabelText("Lag");
    await user.clear(lag);
    await user.type(lag, "3.7");
    fireEvent.blur(lag);

    expect(changes).toEqual([["l1", { lag: 3 }]]);
  });

  it("deletes a link from the editor", async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    const { container } = renderChart({
      onUpdateLink: () => {},
      onDeleteLink: (id) => deleted.push(id),
    });

    await user.click(container.querySelector('svg path[stroke="transparent"]')!);
    await user.click(screen.getByRole("button", { name: /Remove this dependency/ }));

    expect(deleted).toEqual(["l1"]);
    expect(screen.queryByRole("dialog", { name: "Dependency" })).not.toBeInTheDocument();
  });

  it("leaves arrows unclickable when links cannot be edited", () => {
    const { container } = renderChart();
    expect(container.querySelector('svg path[stroke="transparent"]')).toBeNull();
  });
});

describe("GanttChart baselines", () => {
  const withBaseline = items.map((item, i) =>
    i === 0
      ? { ...item, baseline: { start: "2026-02-26", end: "2026-03-02", captured_at: "2026-02-01T00:00:00Z" } }
      : item
  );

  it("offers to capture a baseline when there is none", async () => {
    const user = userEvent.setup();
    renderChart({ onCaptureBaseline: () => {} });
    await user.click(screen.getByRole("button", { name: "Baseline" }));
    expect(screen.getByRole("button", { name: /Set baseline/ })).toBeInTheDocument();
  });

  it("can still re-capture once a baseline exists", async () => {
    // The first version turned the button into a show/hide toggle at this
    // point, which left no way to update a baseline at all.
    const user = userEvent.setup();
    renderChart({
      contexts: [{ board, groups: [group], items: withBaseline }],
      onCaptureBaseline: () => {},
    });
    await user.click(screen.getByRole("button", { name: "Baseline" }));
    expect(screen.getByRole("button", { name: /Update baseline/ })).toBeInTheDocument();
  });

  it("says nothing about baselines when it cannot capture one", () => {
    renderChart();
    expect(screen.queryByRole("button", { name: /baseline/i })).not.toBeInTheDocument();
  });

  it("captures today's dates for every plotted task", async () => {
    const user = userEvent.setup();
    const captured: { itemId: string; start: string; end: string }[][] = [];
    renderChart({ onCaptureBaseline: (b) => captured.push(b) });

    await user.click(screen.getByRole("button", { name: "Baseline" }));
    await user.click(screen.getByRole("button", { name: /Set baseline/ }));
    expect(captured[0]).toHaveLength(3);
    expect(captured[0].find((b) => b.itemId === "i1")).toEqual({
      itemId: "i1",
      start: "2026-03-02",
      end: "2026-03-06",
    });
  });

  it("shows the agreed plan and how far the finish has drifted", async () => {
    // A chart of only the current plan always looks on time.
    const user = userEvent.setup();
    const { container } = renderChart({
      contexts: [{ board, groups: [group], items: withBaseline }],
    });

    await user.click(screen.getByRole("button", { name: "Baseline" }));
    await user.click(screen.getByRole("button", { name: /Show the agreed plan/ }));

    const scale = expectedScale("day");
    const ghost = container.querySelector(
      '[class*="bg-gray-400"]'
    ) as HTMLElement | null;
    expect(ghost).not.toBeNull();
    expect(px(ghost!.style.left)).toBeCloseTo(
      scale.xOf(parseDateOnly("2026-02-26")!),
      3
    );
    // Baseline finish Mar 2, actual finish Mar 6.
    expect(screen.getByText("+4d")).toBeInTheDocument();
  });

  it("keeps the agreed plan hidden until it is asked for", () => {
    renderChart({ contexts: [{ board, groups: [group], items: withBaseline }] });
    expect(screen.queryByText("+4d")).not.toBeInTheDocument();
  });
});

describe("GanttChart critical path", () => {
  it("tells each task how much room it has", () => {
    renderChart();
    // Reunion is unlinked and finishes last, so it is what sets the project's
    // finish date — which leaves the Permis → Devis chain with slack behind it.
    // That is ordinary CPM, and it is exactly the thing the chart could not say
    // before: every bar used to look equally urgent.
    expect(bar("Permis").getAttribute("aria-label")).toContain("5d of slack");
    expect(bar("Devis").getAttribute("aria-label")).toContain("3d of slack");
  });

  it("marks the whole chain critical when it is back to back", async () => {
    const user = userEvent.setup();
    // A chain with no gaps between the tasks: every day of it drives the finish
    // date, so nothing in it has anywhere to move.
    const backToBack = [
      task("i1", "Permis", "2026-03-02", "2026-03-06", 0),
      task("i2", "Devis", "2026-03-07", "2026-03-11", 1),
      task("i3", "Travaux", "2026-03-12", "2026-03-16", 2),
    ];
    renderChart({
      contexts: [{ board, groups: [group], items: backToBack }],
      itemLinks: [
        ...itemLinks,
        {
          id: "l2",
          source_item_id: "i2",
          target_item_id: "i3",
          link_type: "dependency",
          dep_type: "FS",
          lag_days: 0,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: /Critical path/ }));
    for (const name of ["Permis", "Devis", "Travaux"]) {
      expect(bar(name).getAttribute("aria-label")).toContain("critical path");
    }
  });

  it("only paints the path red once it is asked to", async () => {
    const user = userEvent.setup();
    renderChart();

    const before = bar("Permis").style.backgroundColor;
    await user.click(screen.getByRole("button", { name: /Critical path/ }));
    // Permis has slack here, so it stays its group colour either way.
    expect(bar("Permis").style.backgroundColor).toBe(before);
  });

  it("reports a link the dates already break", () => {
    // Devis starts Mar 9; moved back to Mar 3 it begins before Permis finishes.
    const broken = [
      items[0],
      task("i2", "Devis", "2026-03-03", "2026-03-07", 1),
      items[2],
    ];
    renderChart({ contexts: [{ board, groups: [group], items: broken }] });

    expect(screen.getByText("1 broken link")).toBeInTheDocument();
  });

  it("walks to each broken link, opening its editor to be fixed", async () => {
    // The count on its own was a dead end: it said a link was broken and gave
    // no way to reach it.
    const user = userEvent.setup();
    const broken = [
      items[0],
      task("i2", "Devis", "2026-03-03", "2026-03-07", 1),
      items[2],
    ];
    renderChart({
      contexts: [{ board, groups: [group], items: broken }],
      onUpdateLink: () => {},
      onDeleteLink: () => {},
    });

    await user.click(screen.getByRole("button", { name: /1 broken link/ }));

    const editor = await screen.findByRole("dialog", { name: "Dependency" });
    expect(within(editor).getByText("Permis")).toBeInTheDocument();
    expect(within(editor).getByText("Devis")).toBeInTheDocument();
    // The type buttons are right there, so FS can be corrected to SS on the spot.
    expect(within(editor).getByRole("button", { name: "SS" })).toBeInTheDocument();
  });

  it("still walks the broken links when they cannot be edited, without opening an editor", async () => {
    // Finding one is useful even to a reader who cannot change it.
    const user = userEvent.setup();
    const broken = [
      items[0],
      task("i2", "Devis", "2026-03-03", "2026-03-07", 1),
      items[2],
    ];
    renderChart({ contexts: [{ board, groups: [group], items: broken }] });

    await user.click(screen.getByRole("button", { name: /1 broken link/ }));
    expect(screen.queryByRole("dialog", { name: "Dependency" })).not.toBeInTheDocument();
  });

  it("names a dependency loop instead of drawing a plan that cannot exist", () => {
    renderChart({
      itemLinks: [
        ...itemLinks,
        {
          id: "l2",
          source_item_id: "i2",
          target_item_id: "i1",
          link_type: "dependency",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    expect(screen.getByText("2 in a dependency loop")).toBeInTheDocument();
  });
});

describe("GanttChart editing", () => {
  it("offers resize handles only when it can write", () => {
    const { container: readOnly } = renderChart();
    expect(readOnly.querySelectorAll(".cursor-ew-resize")).toHaveLength(0);

    const { container: editable } = renderChart({ onUpdateItem: () => {} });
    // Two handles per bar, on the two real tasks.
    expect(editable.querySelectorAll(".cursor-ew-resize").length).toBe(4);
  });

  it("takes the successors with it when a task is dragged", () => {
    // The complaint this answers: a bar could be pushed a month later and
    // everything depending on it stayed exactly where it was, the arrows
    // quietly pointing backwards.
    const changes: { itemId: string; columnId: string; value: unknown }[][] = [];
    renderChart({
      onUpdateItem: () => {},
      onRescheduleItems: (c) => changes.push(c),
    });

    // Five days at 50px per day.
    fireEvent.pointerDown(bar("Permis"), { clientX: 0 });
    fireEvent.pointerMove(window, { clientX: 250 });
    fireEvent.pointerUp(window);

    expect(changes).toHaveLength(1);
    const byId = new Map(changes[0].map((c) => [c.itemId, c.value]));
    expect(byId.get("i1")).toEqual({ start: "2026-03-07", end: "2026-03-11" });
    // Devis has to start the day after Permis now finishes.
    expect(byId.get("i2")).toEqual({ start: "2026-03-12", end: "2026-03-16" });
  });

  it("leaves a task with enough slack where it is", () => {
    const changes: { itemId: string }[][] = [];
    renderChart({
      onUpdateItem: () => {},
      onRescheduleItems: (c) => changes.push(c),
    });

    // One day later: Permis finishes Mar 7, Devis still starts Mar 9.
    fireEvent.pointerDown(bar("Permis"), { clientX: 0 });
    fireEvent.pointerMove(window, { clientX: 50 });
    fireEvent.pointerUp(window);

    expect(changes[0].map((c) => c.itemId)).toEqual(["i1"]);
  });

  it("moves only the dragged task when there is no reschedule path", () => {
    const updates: string[] = [];
    renderChart({ onUpdateItem: (id) => updates.push(id) });

    fireEvent.pointerDown(bar("Permis"), { clientX: 0 });
    fireEvent.pointerMove(window, { clientX: 250 });
    fireEvent.pointerUp(window);

    expect(updates).toEqual(["i1"]);
  });

  it("moves a task from the keyboard, so the chart works without a mouse", () => {
    // Bars used to be undraggable divs with no tab stop at all.
    const changes: { itemId: string; value: unknown }[][] = [];
    renderChart({
      onUpdateItem: () => {},
      onRescheduleItems: (c) => changes.push(c),
    });

    const target = bar("Permis");
    expect(target.tabIndex).toBe(0);

    fireEvent.keyDown(target, { key: "ArrowRight" });
    expect(new Map(changes[0].map((c) => [c.itemId, c.value])).get("i1")).toEqual({
      start: "2026-03-03",
      end: "2026-03-07",
    });

    fireEvent.keyDown(target, { key: "ArrowLeft" });
    expect(new Map(changes[1].map((c) => [c.itemId, c.value])).get("i1")).toEqual({
      start: "2026-03-01",
      end: "2026-03-05",
    });
  });

  it("resizes from the finish with Shift held", () => {
    const changes: { itemId: string; value: unknown }[][] = [];
    renderChart({
      onUpdateItem: () => {},
      onRescheduleItems: (c) => changes.push(c),
    });

    fireEvent.keyDown(bar("Permis"), { key: "ArrowRight", shiftKey: true });
    expect(new Map(changes[0].map((c) => [c.itemId, c.value])).get("i1")).toEqual({
      start: "2026-03-02",
      end: "2026-03-07",
    });
  });

  it("opens the item from the keyboard too", () => {
    const opened: string[] = [];
    renderChart({ onSelectItem: (item) => opened.push(item.name) });
    fireEvent.keyDown(bar("Permis"), { key: "Enter" });
    expect(opened).toEqual(["Permis"]);
  });

  it("ignores arrow keys when the chart cannot be edited", () => {
    const changes: unknown[] = [];
    renderChart({ onRescheduleItems: (c) => changes.push(c) });
    fireEvent.keyDown(bar("Permis"), { key: "ArrowRight" });
    expect(changes).toHaveLength(0);
  });

  it("opens the item when a bar is clicked rather than only dragged", async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    renderChart({ onSelectItem: (item) => opened.push(item.name) });

    await user.click(bar("Permis"));
    expect(opened).toEqual(["Permis"]);
  });
});
