import { describe, it, expect } from "vitest";
import type { Board, Column, Item, Workspace } from "@/types";
import { delays, myTasks } from "@/lib/agent/reads";
import type { DelayNote } from "@/lib/delays";

const TODAY = "2026-10-06";
const ME = "me";

const columns: Column[] = [
  { id: "tl", title: "Timeline", type: "timeline" },
  { id: "who", title: "Owner", type: "people" },
  {
    id: "st",
    title: "Statut",
    type: "status",
    settings: {
      statusLabels: [
        { label: "En cours", color: "" },
        { label: "Bloqué", color: "" },
        { label: "Fait", color: "" },
      ],
    },
  } as Column,
];
const board: Board = { id: "b1", name: "Lancement", workspace_id: "w1", description: "", columns };
const workspaces: Workspace[] = [{ id: "w1", name: "App C", created_at: "" }];

let n = 0;
function task(
  name: string,
  values: { start?: string; end?: string; who?: string[]; status?: string },
  extra: Partial<Item> = {}
): Item {
  return {
    id: `i${++n}`,
    name,
    group_id: "g1",
    board_id: "b1",
    position: n,
    column_values: {
      ...(values.start ? { tl: { start: values.start, end: values.end ?? values.start } } : {}),
      ...(values.who ? { who: values.who } : {}),
      ...(values.status ? { st: values.status } : {}),
    },
    ...extra,
  } as Item;
}

const items = [
  task("Overdue", { start: "2026-09-28", end: "2026-10-02", who: [ME], status: "En cours" }),
  task("Running", { start: "2026-10-05", end: "2026-10-08", who: [ME] }),
  task("Ends today", { start: "2026-10-06", end: "2026-10-06", who: [ME] }),
  task("Next week", { start: "2026-10-10", end: "2026-10-12", who: [ME] }),
  task("Far", { start: "2026-11-20", end: "2026-11-21", who: [ME] }),
  task("Undated", { who: [ME] }),
  task("Done late", { start: "2026-09-01", end: "2026-09-02", who: [ME], status: "Fait" }),
  task("Trashed", { start: "2026-10-06", who: [ME] }, { deleted_at: "2026-10-01T00:00:00Z" }),
  task("Someone else's", { start: "2026-10-06", who: ["other"] }),
];

const names = (tasks: { name: string }[]) => tasks.map((t) => t.name);

describe("myTasks", () => {
  it("today: what is running today, plus anything overdue, most late first", () => {
    expect(names(myTasks(items, [board], workspaces, ME, TODAY, "today"))).toEqual([
      "Overdue",
      "Ends today",
      "Running",
    ]);
  });

  it("never lists finished work, even when its dates are long past ('Fait' counts as done)", () => {
    for (const range of ["today", "week", "overdue", "all"] as const) {
      expect(names(myTasks(items, [board], workspaces, ME, TODAY, range))).not.toContain("Done late");
    }
  });

  it("week: the next seven days, plus overdue", () => {
    expect(names(myTasks(items, [board], workspaces, ME, TODAY, "week"))).toEqual([
      "Overdue",
      "Ends today",
      "Running",
      "Next week",
    ]);
  });

  it("overdue: only what is past its end", () => {
    const [only, ...rest] = myTasks(items, [board], workspaces, ME, TODAY, "overdue");
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ name: "Overdue", due: "overdue", days_late: 4, board: "App C › Lancement" });
  });

  it("all: every open task of mine, undated last; never trash or other people's", () => {
    const all = names(myTasks(items, [board], workspaces, ME, TODAY, "all"));
    expect(all[all.length - 1]).toBe("Undated");
    expect(all).not.toContain("Trashed");
    expect(all).not.toContain("Someone else's");
    expect(all).toHaveLength(6);
  });

  it("reports the status and dates as the board holds them", () => {
    const [overdue] = myTasks(items, [board], workspaces, ME, TODAY, "overdue");
    expect(overdue).toMatchObject({ status: "En cours", start: "2026-09-28", end: "2026-10-02" });
  });
});

describe("delays", () => {
  const stuck = task("Blocked", { start: "2026-10-10", end: "2026-10-20", who: ["other"], status: "Bloqué" });
  const behind = task(
    "Behind plan",
    { start: "2026-10-01", end: "2026-10-15", who: [ME] },
    { baseline: { start: "2026-10-01", end: "2026-10-09", captured_at: "2026-09-01T00:00:00Z" } }
  );
  const note: DelayNote = {
    id: "n1",
    item_id: behind.id,
    board_id: "b1",
    days: 6,
    category: "supplier",
    note: "Tiles arrived late",
    created_by: ME,
    created_at: "",
    updated_at: "",
  };
  const people = new Map([
    [ME, "Youness"],
    ["other", "Salma"],
  ]);

  const result = delays([...items, stuck, behind], [board], workspaces, [note], people, TODAY);

  it("lists overdue, stuck and behind-plan work, whoever it belongs to", () => {
    expect(names(result).sort()).toEqual(["Behind plan", "Blocked", "Overdue"]);
  });

  it("says who is on it and why it slipped", () => {
    expect(result.find((d) => d.name === "Blocked")).toMatchObject({ stuck: true, assignees: ["Salma"] });
    expect(result.find((d) => d.name === "Behind plan")).toMatchObject({
      behind_plan_days: 6,
      reasons: [{ days: 6, category: "supplier", note: "Tiles arrived late" }],
    });
  });

  it("leaves finished work out", () => {
    expect(names(result)).not.toContain("Done late");
  });
});
