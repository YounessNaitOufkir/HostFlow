import { describe, it, expect } from "vitest";
import type { Board, Column, Group, Item, Workspace } from "@/types";
import {
  computeLessons,
  planningHintFor,
  taskTypeKey,
  DEFAULT_LESSONS_FILTER,
} from "@/lib/dashboard/lessons";
import type { DelayNote } from "@/lib/delays";

const TL: Column = { id: "tl", title: "Timeline", type: "timeline" };
const ST: Column = { id: "st", title: "Status", type: "status" };
const NOW = new Date(2026, 9, 1);

function project(n: number, opts: { plumbingDays: number; done?: boolean; finish?: string } = { plumbingDays: 7 }) {
  const ws: Workspace = { id: `w${n}`, name: `Apt ${n}`, is_private: false } as Workspace;
  const board: Board = { id: `b${n}`, name: "Rénovation", description: "", columns: [TL, ST], workspace_id: ws.id };
  const group: Group = { id: `g${n}`, title: "Travaux", color: "#579bfc", position: 0, board_id: board.id };
  const status = opts.done === false ? {} : { st: "Done" };
  const end = new Date(2026, 8, 1 + opts.plumbingDays - 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const items: Item[] = [
    {
      id: `p${n}`,
      name: n === 2 ? "PLOMBERIE " : n === 3 ? "plomberie" : "Plomberie",
      group_id: group.id,
      board_id: board.id,
      position: 0,
      column_values: { tl: { start: "2026-09-01", end: opts.finish ?? iso(end) }, ...status },
      baseline: { start: "2026-09-01", end: "2026-09-05", captured_at: "" },
    } as Item,
    {
      id: `c${n}`,
      name: "Carrelage",
      group_id: group.id,
      board_id: board.id,
      position: 1,
      column_values: { tl: { start: "2026-09-01", end: "2026-09-03" }, ...status },
      baseline: { start: "2026-09-01", end: "2026-09-03", captured_at: "" },
    } as Item,
  ];
  return { ws, board, group, items };
}

const note = (item: string, board: string, days: number, category: DelayNote["category"]): DelayNote => ({
  id: `${item}-${category}`,
  item_id: item,
  board_id: board,
  days,
  category,
  note: null,
  created_by: "u1",
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
});

function build(ps: ReturnType<typeof project>[], notes: DelayNote[] = [], filter = DEFAULT_LESSONS_FILTER) {
  return computeLessons({
    workspaces: ps.map((p) => p.ws),
    boards: ps.map((p) => p.board),
    groups: ps.map((p) => p.group),
    items: ps.flatMap((p) => p.items),
    notes,
    filter,
    now: NOW,
  });
}

describe("taskTypeKey", () => {
  it("treats accents, capitals and spacing as the same name", () => {
    expect(taskTypeKey("  Électricité ")).toBe(taskTypeKey("electricite"));
    expect(taskTypeKey("Pose  cuisine")).toBe("pose cuisine");
  });
});

describe("computeLessons", () => {
  const ps = [project(1, { plumbingDays: 8 }), project(2, { plumbingDays: 7 }), project(3, { plumbingDays: 7 })];

  it("reviews finished projects and averages their finish against the plan", () => {
    const lessons = build(ps);
    expect(lessons.projects).toHaveLength(3);
    // Planned to finish Sep 5; finished Sep 8, 7, 7.
    expect(lessons.finishSlipAvg).toBeCloseTo((3 + 2 + 2) / 3, 5);
    expect(lessons.onTimeCount).toBe(0);
    expect(lessons.daysLost).toBe(7);
    expect(lessons.lateTaskCount).toBe(3);
  });

  it("leaves out work in progress unless asked", () => {
    const open = [...ps, project(4, { plumbingDays: 9, done: false })];
    expect(build(open).projects).toHaveLength(3);
    expect(build(open, [], { ...DEFAULT_LESSONS_FILTER, includeInProgress: true }).projects).toHaveLength(4);
  });

  it("filters by workspace and by when the project finished", () => {
    expect(build(ps, [], { ...DEFAULT_LESSONS_FILTER, workspaceId: "w2" }).projects).toHaveLength(1);
    const past = project(1, { plumbingDays: 7 });
    const old = [{
      ...past,
      items: past.items.map((i) => ({
        ...i,
        column_values: { ...i.column_values, tl: { start: "2025-05-01", end: "2025-06-01" } },
        baseline: { start: "2025-05-01", end: "2025-05-20", captured_at: "" },
      })) as Item[],
    }];
    expect(build(old, [], { ...DEFAULT_LESSONS_FILTER, period: "6m" }).projects).toHaveLength(0);
    expect(build(old, [], { ...DEFAULT_LESSONS_FILTER, period: "all" }).projects).toHaveLength(1);
  });

  it("groups the same task across projects, whatever its spelling", () => {
    const lessons = build(ps);
    const plumbing = lessons.taskTypes.find((type) => type.key === "plomberie")!;
    expect(plumbing.projectCount).toBe(3);
    expect(plumbing.name).toBe("Plomberie");
    expect(plumbing.plannedAvg).toBe(5);
    expect(plumbing.actualAvg).toBeCloseTo(22 / 3, 5);
    expect(plumbing.lateRuns).toBe(3);
    // Carrelage kept its plan: not a type that runs long.
    expect(lessons.taskTypes.map((type) => type.key)).not.toContain("carrelage");
  });

  it("adds up days lost by reason, split by project", () => {
    const lessons = build(ps, [note("p1", "b1", 3, "supplier"), note("p2", "b2", 2, "supplier"), note("p3", "b3", 1, "rework")]);
    expect(lessons.lostByReason.map((r) => [r.category, r.days])).toEqual([
      ["supplier", 5],
      ["rework", 1],
    ]);
    expect(lessons.lostByReason[0].byProject).toEqual([
      { name: "Apt 1", days: 3 },
      { name: "Apt 2", days: 2 },
    ]);
    expect(lessons.unexplainedTotal).toBe(1);
    expect(lessons.explainedDays).toBe(6);
    expect(lessons.taskTypes[0].topReason).toBe("supplier");
  });

  it("only gives advice once a task type has run over in 3 projects", () => {
    expect(build(ps).advice.map((type) => type.key)).toEqual(["plomberie"]);
    expect(build(ps.slice(0, 2)).advice).toEqual([]);
  });
});

describe("planningHintFor", () => {
  const { typeIndex } = build([
    project(1, { plumbingDays: 8 }),
    project(2, { plumbingDays: 7 }),
    project(3, { plumbingDays: 7 }),
  ]);

  it("suggests the usual length when a task is planned shorter", () => {
    const hint = planningHintFor("plomberie", 5, typeIndex);
    expect(hint?.suggestedDays).toBe(7);
    expect(hint?.type.projectCount).toBe(3);
  });

  it("stays quiet when the plan already allows for it, or there is no history", () => {
    expect(planningHintFor("Plomberie", 7, typeIndex)).toBeNull();
    expect(planningHintFor("Carrelage", 1, typeIndex)).toBeNull();
    expect(planningHintFor("Menuiserie", 2, typeIndex)).toBeNull();
  });
});
