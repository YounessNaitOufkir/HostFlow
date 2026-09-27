import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { Board, Column, Group, Item, ItemLink, Profile } from "@/types";
import GanttChart from "@/components/gantt/GanttChart";
import { createGanttScale, ganttBounds, PX_PER_DAY } from "@/lib/gantt/scale";
import { parseDateOnly } from "@/lib/gantt/dates";
import type { GanttBoardContext } from "@/lib/gantt/rows";

const TIMELINE: Column = { id: "col-timeline", title: "Works", type: "timeline" };
const DEP: Column = { id: "col-dep", title: "Depends on", type: "dependency" };
/** The board's declared milestone checkbox: the only thing that makes a diamond. */
const MILESTONE: Column = { id: "col-milestone", title: "Milestone", type: "checkbox" };

const board: Board = {
  id: "b1",
  name: "Lancement",
  description: "",
  columns: [TIMELINE, DEP, MILESTONE],
  gantt_config: { milestoneColumnId: MILESTONE.id },
};

const group: Group = {
  id: "g1",
  title: "Phase 1",
  color: "#00c875",
  position: 0,
  board_id: "b1",
};

function task(id: string, name: string, start: string, end: string, position: number, milestone = false): Item {
  return {
    id,
    name,
    group_id: "g1",
    board_id: "b1",
    position,
    column_values: { [TIMELINE.id]: { start, end }, [MILESTONE.id]: milestone },
  };
}

/** Permis runs Mar 2–6, Devis Mar 9–13 and depends on it, Reunion is a milestone. */
const items: Item[] = [
  task("i1", "Permis", "2026-03-02", "2026-03-06", 0),
  task("i2", "Devis", "2026-03-09", "2026-03-13", 1),
  task("i3", "Reunion", "2026-03-16", "2026-03-16", 2, true),
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
function expectedScale(zoom: "day" | "week" | "month") {
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

    for (const zoom of ["Week", "Month", "Day"] as const) {
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
    await user.click(screen.getByRole("button", { name: "Month" }));

    for (const name of ["Permis", "Devis"]) {
      expect(px(bar(name).style.width)).toBeGreaterThanOrEqual(PX_PER_DAY.month);
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

  it("renders a task ticked as a milestone as a diamond", () => {
    renderChart();
    expect(
      screen.getByRole("button", { name: /^Milestone: Reunion/ })
    ).toBeInTheDocument();
  });

  it("renders a one-day task as a bar filling its day", () => {
    const oneDay = task("i4", "Livraison", "2026-03-18", "2026-03-18", 3);
    renderChart({ contexts: [{ board, groups: [group], items: [...items, oneDay] }] });
    const bar = screen.getByRole("button", { name: /^Livraison,/ });
    expect(screen.queryByRole("button", { name: /^Milestone: Livraison/ })).toBeNull();
    expect(parseFloat(bar.style.width)).toBeGreaterThanOrEqual(PX_PER_DAY.day);
  });

  it("sizes rows and bars by the chosen row size", async () => {
    const user = userEvent.setup();
    renderChart();
    const rowOf = () => screen.getByRole("button", { name: /^Permis,/ }).parentElement as HTMLElement;
    expect(parseFloat(rowOf().style.height)).toBe(48);

    await user.click(screen.getByRole("button", { name: /View/ }));
    await user.click(screen.getByRole("button", { name: "Compact" }));
    expect(parseFloat(rowOf().style.height)).toBe(36);
    expect(screen.getByRole("button", { name: /^Permis,/ }).style.height).toBe("18px");
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

/** Critical path, baseline, fields and colours live behind the View button. */
async function openViewMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^View/ }));
}

describe("GanttChart baselines", () => {
  const withBaseline = items.map((item, i) =>
    i === 0
      ? { ...item, baseline: { start: "2026-02-26", end: "2026-03-02", captured_at: "2026-02-01T00:00:00Z" } }
      : item
  );

  it("offers to capture a baseline when there is none", async () => {
    const user = userEvent.setup();
    renderChart({ onCaptureBaseline: () => {} });
    await openViewMenu(user);
    expect(screen.getByRole("button", { name: "Set baseline" })).toBeInTheDocument();
  });

  it("can still re-capture once a baseline exists", async () => {
    // The first version turned the button into a show/hide toggle at this
    // point, which left no way to update a baseline at all.
    const user = userEvent.setup();
    renderChart({
      contexts: [{ board, groups: [group], items: withBaseline }],
      onCaptureBaseline: () => {},
    });
    await openViewMenu(user);
    expect(screen.getByRole("button", { name: /Update baseline/ })).toBeInTheDocument();
  });

  it("says nothing about baselines when it cannot capture one", async () => {
    const user = userEvent.setup();
    renderChart();
    await openViewMenu(user);
    // Nothing captured and no way to capture: a permanently dead switch is
    // worse than an absent one.
    expect(screen.queryByRole("switch", { name: /baseline/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /baseline/i })).not.toBeInTheDocument();
  });

  it("captures today's dates for every plotted task", async () => {
    const user = userEvent.setup();
    const captured: { itemId: string; start: string; end: string }[][] = [];
    renderChart({ onCaptureBaseline: (b) => captured.push(b) });

    await openViewMenu(user);
    await user.click(screen.getByRole("button", { name: "Set baseline" }));
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

    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Baseline/ }));

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

  it("remembers what was switched on when the chart is opened again", async () => {
    const user = userEvent.setup();
    const first = renderChart({ contexts: [{ board, groups: [group], items: withBaseline }] });
    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Baseline/ }));
    await user.click(screen.getByRole("switch", { name: /Critical path/ }));
    await user.click(screen.getByRole("button", { name: "Status" }));
    first.unmount();

    // Leaving the Gantt and coming back used to switch the baseline off again.
    renderChart({ contexts: [{ board, groups: [group], items: withBaseline }] });
    expect(screen.getByText("+4d")).toBeInTheDocument();
    await openViewMenu(user);
    expect(screen.getByRole("switch", { name: /Baseline/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: /Critical path/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Status" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the agreed plan hidden until it is asked for", () => {
    renderChart({ contexts: [{ board, groups: [group], items: withBaseline }] });
    expect(screen.queryByText("+4d")).not.toBeInTheDocument();
  });
});

describe("GanttChart critical path", () => {
  // Overdue unfinished work is forecast from today, so these fix the date
  // before the plan starts. Only Date is faked; user-event needs real timers.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 1, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tells each task how much room it has", () => {
    renderChart();
    // Reunion is unlinked and finishes last, so it is what sets the project's
    // finish date — which leaves the Permis → Devis chain with slack behind it.
    // That is ordinary CPM, and it is exactly the thing the chart could not say
    // before: every bar used to look equally urgent.
    expect(bar("Permis").getAttribute("aria-label")).toContain("5d of slack");
    expect(bar("Devis").getAttribute("aria-label")).toContain("3d of slack");
  });

  it("measures each board against its own finish on the Master Gantt", () => {
    // A second apartment finishing months later used to hand every task on
    // this board its slack: one shared finish date for the whole portfolio.
    const board2: Board = { ...board, id: "b2", name: "Autre appartement" };
    const group2: Group = { ...group, id: "g2", board_id: "b2" };
    const later: Item = {
      ...task("j1", "Chantier", "2026-03-01", "2026-06-30", 0),
      group_id: "g2",
      board_id: "b2",
    };
    renderChart({
      showProjectRows: true,
      contexts: [
        { board, groups: [group], items },
        { board: board2, groups: [group2], items: [later] },
      ],
    });
    expect(bar("Permis").getAttribute("aria-label")).toContain("5d of slack");
    expect(bar("Chantier").getAttribute("aria-label")).toContain("no slack");
  });

  it("shows how far a board runs past its target", () => {
    // Reunion closes the board on Mar 16; it has to be done by Mar 12.
    const due: Board = { ...board, gantt_config: { ...board.gantt_config, targetFinish: "2026-03-12" } };
    renderChart({ contexts: [{ board: due, groups: [group], items }] });

    expect(screen.getByText("Target missed by 4d")).toBeInTheDocument();
    // Devis ends Mar 13: one day past the target itself.
    expect(bar("Devis").getAttribute("aria-label")).toContain("1d past the target");
    expect(screen.getByTestId("gantt-target-line")).toBeInTheDocument();
  });

  it("says nothing is late while the plan holds its target", () => {
    const due: Board = { ...board, gantt_config: { ...board.gantt_config, targetFinish: "2026-03-31" } };
    renderChart({ contexts: [{ board: due, groups: [group], items }] });
    expect(screen.queryByText(/Target missed/)).not.toBeInTheDocument();
    expect(bar("Devis").getAttribute("aria-label")).toContain("3d of slack");
    expect(screen.getByText("Target 31 Mar")).toBeInTheDocument();
  });

  it("offers to set a target only when it can be saved", () => {
    const { unmount } = renderChart();
    expect(screen.queryByRole("button", { name: /target/i })).not.toBeInTheDocument();
    unmount();
    renderChart({ onUpdateGanttConfig: () => {} });
    expect(screen.getByText("Set target")).toBeInTheDocument();
  });

  it("counts boards past target on the Master Gantt", () => {
    const due: Board = { ...board, gantt_config: { ...board.gantt_config, targetFinish: "2026-03-12" } };
    renderChart({ showProjectRows: true, contexts: [{ board: due, groups: [group], items }] });
    expect(screen.getByText("1 board past target")).toBeInTheDocument();
  });

  it("fades what is off the path while it is highlighted", async () => {
    const user = userEvent.setup();
    renderChart();
    expect(bar("Permis").style.opacity).toBe("");
    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Critical path/ }));
    // Permis has slack; Reunion closes the board and stays at full strength.
    expect(bar("Permis").style.opacity).toBe("0.3");
    expect(
      screen.getByRole("button", { name: /^Milestone: Reunion/ }).style.opacity
    ).toBe("");
  });

  it("shows only the critical tasks when asked", async () => {
    const user = userEvent.setup();
    renderChart();
    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Critical path/ }));
    await user.click(screen.getByRole("button", { name: "Only critical" }));

    expect(screen.queryByRole("button", { name: /^Permis,/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Devis,/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Milestone: Reunion/ })).toBeInTheDocument();
    expect(localStorage.getItem("hostflow_gantt_cpdisplay_test")).toBe("only");

    // Turning the path off brings every task back.
    await user.click(screen.getByRole("switch", { name: /Critical path/ }));
    expect(bar("Permis")).toBeInTheDocument();
  });

  it("says so when nothing is critical", async () => {
    const user = userEvent.setup();
    localStorage.setItem("hostflow_gantt_cpdisplay_test", "only");
    const STATUS: Column = { id: "col-status", title: "Status", type: "status" };
    const allDone = items.map((item) => ({
      ...item,
      column_values: { ...item.column_values, [STATUS.id]: "Done" },
    }));
    renderChart({
      contexts: [{ board: { ...board, columns: [...board.columns, STATUS] }, groups: [group], items: allDone }],
    });
    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Critical path/ }));
    expect(screen.getByText("No critical tasks")).toBeInTheDocument();
  });

  it("says when the next task is the tighter limit", () => {
    // Permis can slip 5 days before the board's finish moves, but only 2
    // (the weekend) before Devis does.
    renderChart();
    expect(bar("Permis").getAttribute("aria-label")).toContain(
      "5d of slack, 2d before it delays the next task"
    );
    // Devis has nothing after it: its free slack is its total, so no note.
    expect(bar("Devis").getAttribute("aria-label")).not.toContain("before it delays");
  });

  it("flags near-critical tasks once the threshold allows", async () => {
    const user = userEvent.setup();
    renderChart();
    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Critical path/ }));
    // Devis has 3 days of slack: not critical at 0, critical at 3.
    expect(bar("Devis").style.backgroundColor).not.toBe("rgb(226, 68, 92)");
    await user.click(screen.getByRole("button", { name: "3 days of slack" }));
    expect(bar("Devis").style.backgroundColor).toBe("rgb(226, 68, 92)");
    expect(bar("Permis").style.backgroundColor).not.toBe("rgb(226, 68, 92)");
    expect(localStorage.getItem("hostflow_gantt_cpthreshold_test")).toBe("3");
  });

  it("draws how much slack a task has while the path is shown", async () => {
    const user = userEvent.setup();
    renderChart();
    expect(screen.queryAllByTestId("gantt-slack-bar")).toHaveLength(0);
    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Critical path/ }));

    // Permis and Devis have slack; Reunion closes the board and has none.
    const slackBars = screen.getAllByTestId("gantt-slack-bar");
    expect(slackBars).toHaveLength(2);
    const scale = expectedScale("day");
    // Devis ends Mar 13 with 3 days: the bar runs Mar 14 through Mar 16.
    const devisSlack = slackBars.find(
      (el) => Math.abs(px(el.style.left) - scale.xOf(parseDateOnly("2026-03-14")!)) < 0.01
    );
    expect(devisSlack).toBeDefined();
    expect(px(devisSlack!.style.width)).toBeCloseTo(3 * scale.pxPerDay, 3);
  });

  it("keeps the critical path when a filter hides tasks", () => {
    // Filtered down to Permis → Devis, Reunion is off screen - but it still
    // closes the board, so the chain keeps its slack.
    renderChart({
      contexts: [{ board, groups: [group], items: items.slice(0, 2) }],
      planContexts: [{ board, groups: [group], items }],
    });
    expect(bar("Devis").getAttribute("aria-label")).toContain("3d of slack");
  });

  it("takes a task off the path once its status says it is done", () => {
    const STATUS: Column = { id: "col-status", title: "Statut", type: "status" };
    const withStatus: Board = { ...board, columns: [...board.columns, STATUS] };
    const status = (item: Item, value: string): Item => ({
      ...item,
      column_values: { ...item.column_values, [STATUS.id]: value },
    });
    renderChart({
      contexts: [
        {
          board: withStatus,
          groups: [group],
          // French label: read through the board's own vocabulary, not "Done".
          items: [status(items[0], "Terminé"), status(items[1], "En cours"), items[2]],
        },
      ],
    });
    expect(bar("Permis").getAttribute("aria-label")).toContain("done - off the critical path");
    expect(bar("Devis").getAttribute("aria-label")).toContain("3d of slack");
  });

  it("forecasts an overdue unfinished task from today", () => {
    // Mar 10: Permis (ended Mar 6) is still not done, so it cannot finish
    // before today. Devis behind it now runs Mar 11-15, one day before
    // Reunion closes the board on Mar 16 - so the chain's 3 days of slack
    // are down to 1.
    vi.setSystemTime(new Date(2026, 2, 10, 12));
    renderChart();
    expect(bar("Permis").getAttribute("aria-label")).toContain(
      "overdue - now forecast to finish 10 Mar, 1d of slack"
    );
    expect(bar("Devis").getAttribute("aria-label")).toContain("1d of slack");
    expect(bar("Devis").getAttribute("aria-label")).not.toContain("overdue");
    expect(screen.getAllByTestId("gantt-late-stretch")).toHaveLength(1);
  });

  it("does not forecast a finished task as late", () => {
    vi.setSystemTime(new Date(2026, 2, 10, 12));
    const STATUS: Column = { id: "col-status", title: "Status", type: "status" };
    renderChart({
      contexts: [
        {
          board: { ...board, columns: [...board.columns, STATUS] },
          groups: [group],
          items: [
            { ...items[0], column_values: { ...items[0].column_values, [STATUS.id]: "Done" } },
            items[1],
            items[2],
          ],
        },
      ],
    });
    expect(bar("Permis").getAttribute("aria-label")).not.toContain("overdue");
    expect(screen.queryByTestId("gantt-late-stretch")).toBeNull();
  });

  it("gives each linked chain its own path in chain mode", async () => {
    const user = userEvent.setup();
    renderChart();
    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Critical path/ }));
    await user.click(screen.getByRole("button", { name: "Each chain" }));

    // Permis → Devis no longer measures against the unlinked Reunion. Permis
    // keeps only the weekend between it and Devis (was 5 days before).
    expect(bar("Permis").getAttribute("aria-label")).toContain("2d of slack");
    expect(bar("Devis").getAttribute("aria-label")).toContain("no slack");
    expect(
      screen.getByRole("button", { name: /^Milestone: Reunion/ }).getAttribute("aria-label")
    ).toContain("not linked to any task");
    // Remembered for this chart.
    expect(localStorage.getItem("hostflow_gantt_cpscope_test")).toBe("chain");
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

    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Critical path/ }));
    for (const name of ["Permis", "Devis", "Travaux"]) {
      expect(bar(name).getAttribute("aria-label")).toContain("critical path");
    }
  });

  it("only paints the path red once it is asked to", async () => {
    const user = userEvent.setup();
    renderChart();

    const before = bar("Permis").style.backgroundColor;
    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Critical path/ }));
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

describe("GanttChart delay notes", () => {
  // Permis was agreed to finish Mar 2; it now finishes Mar 6: +4d.
  const late = items.map((item, i) =>
    i === 0
      ? { ...item, baseline: { start: "2026-02-26", end: "2026-03-02", captured_at: "2026-02-01T00:00:00Z" } }
      : item
  );
  const note = {
    id: "n1",
    item_id: "i1",
    board_id: "b1",
    days: 3,
    category: "supplier" as const,
    note: "Tiles late",
    created_by: "u1",
    created_at: "2026-03-05T00:00:00Z",
    updated_at: "2026-03-05T00:00:00Z",
  };

  async function showBaseline(user: ReturnType<typeof userEvent.setup>) {
    await openViewMenu(user);
    await user.click(screen.getByRole("switch", { name: /Baseline/ }));
    await user.keyboard("{Escape}");
  }

  it("turns the slip into a button that opens its notes", async () => {
    const user = userEvent.setup();
    renderChart({
      contexts: [{ board, groups: [group], items: late }],
      delays: { byItem: new Map([["i1", [note]]]), currentUserId: "u1" },
    });
    await showBaseline(user);
    const chip = screen.getByTestId("gantt-slip-chip");
    expect(chip).toHaveTextContent("+4d");
    // 3 of the 4 days are explained: still outlined as unexplained.
    expect(chip.className).toContain("border-dashed");

    await user.click(chip);
    const dialog = screen.getByRole("dialog", { name: "Delays" });
    expect(within(dialog).getByText("Tiles late")).toBeInTheDocument();
    expect(within(dialog).getByText(/1 day not explained/)).toBeInTheDocument();
  });

  it("saves a reason against the task it belongs to", async () => {
    const user = userEvent.setup();
    const added: [string, unknown][] = [];
    renderChart({
      contexts: [{ board, groups: [group], items: late }],
      delays: {
        byItem: new Map(),
        onAdd: async (item, values) => {
          added.push([item.id, values]);
          return true;
        },
      },
    });
    await showBaseline(user);
    await user.click(screen.getByTestId("gantt-slip-chip"));
    await user.click(screen.getByRole("button", { name: /Add a reason/ }));
    await user.click(screen.getByRole("radio", { name: "Client change" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(added).toEqual([["i1", { days: 4, category: "client_change", note: "" }]]);
  });

  it("keeps the plain number where notes cannot be read", async () => {
    const user = userEvent.setup();
    renderChart({ contexts: [{ board, groups: [group], items: late }] });
    await showBaseline(user);
    expect(screen.queryByTestId("gantt-slip-chip")).not.toBeInTheDocument();
    expect(screen.getByText("+4d")).toBeInTheDocument();
  });

  it("reminds a board with no baseline to set one, only where it can be", () => {
    const { unmount } = renderChart({ onCaptureBaseline: () => {} });
    expect(screen.getByRole("button", { name: /No baseline yet/ })).toBeInTheDocument();
    unmount();
    // Read-only: nothing to offer.
    const second = renderChart();
    expect(screen.queryByRole("button", { name: /No baseline yet/ })).not.toBeInTheDocument();
    second.unmount();
    // Master Gantt: baselines are set per board, not here.
    renderChart({ onCaptureBaseline: () => {}, showProjectRows: true });
    expect(screen.queryByRole("button", { name: /No baseline yet/ })).not.toBeInTheDocument();
  });

  it("stops reminding once a baseline exists", () => {
    renderChart({ contexts: [{ board, groups: [group], items: late }], onCaptureBaseline: () => {} });
    expect(screen.queryByRole("button", { name: /No baseline yet/ })).not.toBeInTheDocument();
  });
});

describe("GanttChart renaming", () => {
  const nameCell = (name: string) =>
    screen.getAllByText(name).find((el) => el.closest("[data-gantt-name]"))!.closest(
      "[data-gantt-name]"
    ) as HTMLElement;

  it("renames a task from a double-click on its name", async () => {
    const user = userEvent.setup();
    const renamed: [string, string][] = [];
    renderChart({
      onUpdateItem: () => {},
      onRenameItem: (item, name) => void renamed.push([item.id, name]),
    });
    await user.dblClick(nameCell("Permis"));
    const input = screen.getByRole("textbox", { name: "Task name" });
    expect(input).toHaveValue("Permis");
    await user.clear(input);
    await user.type(input, "  Permis de construire {Enter}");
    expect(renamed).toEqual([["i1", "Permis de construire"]]);
    expect(screen.queryByRole("textbox", { name: "Task name" })).not.toBeInTheDocument();
  });

  it("saves on clicking away, once", async () => {
    const user = userEvent.setup();
    const renamed: string[] = [];
    renderChart({ onUpdateItem: () => {}, onRenameItem: (_i, name) => void renamed.push(name) });
    await user.dblClick(nameCell("Devis"));
    await user.type(screen.getByRole("textbox", { name: "Task name" }), " final");
    await user.click(document.body);
    expect(renamed).toEqual(["Devis final"]);
  });

  it("cancels on Escape, and saves nothing blank or unchanged", async () => {
    const user = userEvent.setup();
    const renamed: string[] = [];
    renderChart({ onUpdateItem: () => {}, onRenameItem: (_i, name) => void renamed.push(name) });

    await user.dblClick(nameCell("Permis"));
    await user.type(screen.getByRole("textbox", { name: "Task name" }), "xyz{Escape}");
    await user.dblClick(nameCell("Permis"));
    await user.clear(screen.getByRole("textbox", { name: "Task name" }));
    await user.keyboard("{Enter}");
    await user.dblClick(nameCell("Permis"));
    await user.keyboard("{Enter}");

    expect(renamed).toEqual([]);
    expect(nameCell("Permis")).toBeInTheDocument();
  });

  it("does not open the task on the way to a rename, but still opens it on a click", async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    renderChart({
      onUpdateItem: () => {},
      onRenameItem: () => {},
      onSelectItem: (item) => opened.push(item.id),
    });
    await user.dblClick(nameCell("Permis"));
    await new Promise((r) => setTimeout(r, 350));
    expect(opened).toEqual([]);

    await user.keyboard("{Escape}");
    await user.click(nameCell("Devis"));
    await new Promise((r) => setTimeout(r, 350));
    expect(opened).toEqual(["i2"]);
  });

  it("offers no rename on a read-only chart", async () => {
    const user = userEvent.setup();
    renderChart({ onRenameItem: () => {} });
    await user.dblClick(nameCell("Permis"));
    expect(screen.queryByRole("textbox", { name: "Task name" })).not.toBeInTheDocument();
  });
});

describe("GanttChart assignees", () => {
  const PEOPLE: Column = { id: "col-people", title: "Owner", type: "people" };
  const profile = (id: string, full_name: string) =>
    ({ id, full_name, avatar_initials: "", color: "#579bfc" }) as Profile;
  const people = [
    profile("u1", "Amina Idrissi"),
    profile("u2", "Léo Martin"),
    profile("u3", "Sara Benali"),
    profile("u4", "Omar Tazi"),
  ];

  function withOwners(ids: string[]) {
    const withPeople: Board = { ...board, columns: [...board.columns, PEOPLE] };
    return [
      {
        board: withPeople,
        groups: [group],
        items: [{ ...items[0], column_values: { ...items[0].column_values, [PEOPLE.id]: ids } }, items[1]],
      },
    ];
  }

  it("shows faces instead of names beside the bar", () => {
    renderChart({ contexts: withOwners(["u1", "u2"]), profiles: people });
    const stack = screen.getByTestId("gantt-assignees");
    expect(within(stack).getByTitle("Amina Idrissi")).toBeInTheDocument();
    expect(within(stack).getByTitle("Léo Martin")).toBeInTheDocument();
    expect(screen.queryByText("Amina Idrissi, Léo Martin")).not.toBeInTheDocument();
  });

  it("stops at three faces and counts the rest", () => {
    renderChart({ contexts: withOwners(["u1", "u2", "u3", "u4"]), profiles: people });
    const stack = screen.getByTestId("gantt-assignees");
    expect(within(stack).getByText("+1")).toHaveAttribute("title", "Omar Tazi");
  });

  async function colorByAssignee(user: ReturnType<typeof userEvent.setup>) {
    await openViewMenu(user);
    await user.click(screen.getByRole("button", { name: "Assignee" }));
  }

  it("colours a bar in its assignee's colour", async () => {
    const user = userEvent.setup();
    const chosen = [{ ...people[0], color: "#00a36c" }, ...people.slice(1)];
    renderChart({ contexts: withOwners(["u1"]), profiles: chosen });
    await colorByAssignee(user);
    expect(bar("Permis").style.backgroundColor).toBe("rgb(0, 163, 108)");
    expect(bar("Permis").style.backgroundImage).toBe("");
  });

  it("stripes a bar with several assignees, one stripe each", async () => {
    const user = userEvent.setup();
    const chosen = [
      { ...people[0], color: "#00a36c" },
      { ...people[1], color: "#7c3aed" },
      ...people.slice(2),
    ];
    renderChart({ contexts: withOwners(["u1", "u2"]), profiles: chosen });
    await colorByAssignee(user);
    const image = bar("Permis").style.backgroundImage;
    expect(image).toContain("linear-gradient");
    expect(image).toMatch(/0, 163, 108|#00a36c/);
    expect(image).toMatch(/124, 58, 237|#7c3aed/);
  });

  it("paints a task with nobody on it grey", async () => {
    const user = userEvent.setup();
    renderChart({ contexts: withOwners([]), profiles: people });
    await colorByAssignee(user);
    expect(bar("Permis").style.backgroundColor).toBe("rgb(196, 196, 196)");
  });

  it("leaves out someone no longer on file, and shows nothing for nobody", () => {
    renderChart({ contexts: withOwners(["deleted-user"]), profiles: people });
    expect(screen.queryByTestId("gantt-assignees")).not.toBeInTheDocument();
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

  it("pushes a successor a filter has hidden", () => {
    // Devis is filtered off screen, but it still waits on Permis.
    const changes: { itemId: string; columnId: string; value: unknown }[][] = [];
    renderChart({
      contexts: [{ board, groups: [group], items: [items[0], items[2]] }],
      planContexts: [{ board, groups: [group], items }],
      onUpdateItem: () => {},
      onRescheduleItems: (c) => changes.push(c),
    });

    fireEvent.pointerDown(bar("Permis"), { clientX: 0 });
    fireEvent.pointerMove(window, { clientX: 250 });
    fireEvent.pointerUp(window);

    const byId = new Map(changes[0].map((c) => [c.itemId, c.value]));
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
