import { describe, it, expect } from "vitest";
import type { Board, Item } from "@/types";
import type { GanttDependency } from "@/lib/gantt/dependencies";
import { addDaysOnly, dayIndex, parseDateOnly, toDateOnly } from "@/lib/gantt/dates";
import {
  FOLLOW_UP_DUE,
  POINTS_PER_SUCCESSOR,
  SLACK_NONE,
  SUCCESSOR_CAP,
  URGENCY_2_DAYS,
  URGENCY_OVERDUE,
  rankNow,
  type MissionInput,
} from "@/lib/mission/score";

const TODAY_DATE = parseDateOnly("2026-10-08")!;
const TODAY = dayIndex(TODAY_DATE);
const day = (offset: number) => toDateOnly(addDaysOnly(TODAY_DATE, offset));

const board: Board = {
  id: "b1",
  name: "Agdal",
  description: "",
  workspace_id: "ws1",
  columns: [
    { id: "tl", title: "Timeline", type: "timeline" },
    { id: "p", title: "Owner", type: "people" },
    { id: "st", title: "Status", type: "status" },
    { id: "w", title: "Waiting on", type: "waiting_on" },
  ],
};
const boardsById = new Map([[board.id, board]]);

const task = (
  id: string,
  opts: { start?: number; end?: number; people?: string[]; status?: string; deleted?: boolean; waiting?: unknown } = {}
): Item => ({
  id,
  name: id,
  board_id: "b1",
  group_id: "g",
  position: 0,
  deleted_at: opts.deleted ? "2026-10-01T00:00:00Z" : null,
  column_values: {
    ...(opts.end !== undefined ? { tl: { start: day(opts.start ?? opts.end), end: day(opts.end) } } : {}),
    ...(opts.people ? { p: opts.people } : {}),
    ...(opts.status ? { st: opts.status } : {}),
    ...(opts.waiting ? { w: opts.waiting } : {}),
  },
});
const dep = (s: string, t: string): GanttDependency => ({ id: `${s}>${t}`, sourceId: s, targetId: t, type: "FS", lag: 0 });
const input = (items: Item[], deps: GanttDependency[] = []): MissionInput => ({ items, boardsById, deps, todayIdx: TODAY });

/** A, due tomorrow, followed by a back-to-back chain of six open tasks. */
function chain() {
  const items = [task("A", { end: 1 })];
  const deps: GanttDependency[] = [];
  let prev = "A";
  for (let i = 1; i <= 6; i++) {
    const id = `S${i}`;
    items.push(task(id, { start: 1 + i, end: 1 + i }));
    deps.push(dep(prev, id));
    prev = id;
  }
  return { items, deps };
}

describe("rankNow", () => {
  it("scores a critical blocker due tomorrow above a lone overdue task", () => {
    const { items, deps } = chain();
    items.push(task("B", { end: -3 }));
    const ranked = rankNow(input(items, deps));
    const a = ranked.find((r) => r.item.id === "A")!;
    const b = ranked.find((r) => r.item.id === "B")!;
    expect(a.score).toBe(URGENCY_2_DAYS + SLACK_NONE + 6 * POINTS_PER_SUCCESSOR);
    expect(b.score).toBe(URGENCY_OVERDUE);
    expect(ranked.indexOf(a)).toBeLessThan(ranked.indexOf(b));
    expect(ranked[0].item.id).toBe("A");
  });

  it("returns reasons in order: urgency, critical, float, unblocks, follow-up", () => {
    const { items, deps } = chain();
    items[0] = task("A", { end: 1, waiting: { who: "Menuisier", since: day(-5), followUp: day(0) } });
    const a = rankNow(input(items, deps)).find((r) => r.item.id === "A")!;
    expect(a.reasons).toEqual([
      { kind: "dueSoon", days: 1 },
      { kind: "critical" },
      { kind: "float", days: 0 },
      { kind: "unblocks", count: 6 },
      { kind: "followUp", who: "Menuisier" },
    ]);
  });

  it("gives an unlinked task no slack score, even when it ends last on its board", () => {
    const lone = rankNow(input([task("Lone", { end: 1 })])).find((r) => r.item.id === "Lone")!;
    expect(lone.score).toBe(URGENCY_2_DAYS);
    expect(lone.reasons.map((r) => r.kind)).toEqual(["dueSoon"]);
  });

  it("caps the successor points at 10", () => {
    const items = [task("Hub")];
    const deps: GanttDependency[] = [];
    for (let i = 0; i < 14; i++) {
      items.push(task(`T${i}`));
      deps.push(dep("Hub", `T${i}`));
    }
    const hub = rankNow(input(items, deps)).find((r) => r.item.id === "Hub")!;
    expect(hub.score).toBe(SUCCESSOR_CAP * POINTS_PER_SUCCESSOR);
    expect(hub.reasons).toEqual([{ kind: "unblocks", count: 14 }]);
  });

  it("adds points for a due follow-up only", () => {
    const due = task("Due", { waiting: { who: "Banque", since: day(-2), followUp: day(-1) } });
    const later = task("Later", { waiting: { who: "Banque", since: day(-2), followUp: day(3) } });
    const ranked = rankNow(input([due, later]));
    expect(ranked.map((r) => [r.item.id, r.score])).toEqual([["Due", FOLLOW_UP_DUE]]);
  });

  it("breaks ties by sooner due date, then more successors, then name", () => {
    const items = [task("Zed", { end: -1 }), task("Alpha", { end: -2 }), task("Beta", { end: -2 }), task("Gamma", { end: -2 })];
    // Overdue tasks score the same; Gamma also unblocks an undated, otherwise score-0 task.
    items.push(task("Leaf"));
    const ranked = rankNow(input(items, [dep("Gamma", "Leaf")]));
    expect(ranked.map((r) => r.item.id).slice(0, 4)).toEqual(["Gamma", "Alpha", "Beta", "Zed"]);
  });

  it("excludes done and trashed items, drops score-0 tasks, and never counts done successors", () => {
    const items = [
      task("Done", { end: -1, status: "Done" }),
      task("Trash", { end: -1, deleted: true }),
      task("Far", { end: 30 }),
      task("Root"),
      task("DoneChild", { status: "Done" }),
    ];
    const ranked = rankNow(input(items, [dep("Root", "DoneChild")]));
    expect(ranked).toEqual([]);
  });

  it("with personId keeps only that person's tasks; without it a 2-assignee task appears once", () => {
    const items = [task("Shared", { end: -1, people: ["u1", "u2"] }), task("Other", { end: -1, people: ["u2"] })];
    expect(rankNow(input(items), { personId: "u1" }).map((r) => r.item.id)).toEqual(["Shared"]);
    expect(rankNow(input(items)).map((r) => r.item.id).sort()).toEqual(["Other", "Shared"]);
  });
});
