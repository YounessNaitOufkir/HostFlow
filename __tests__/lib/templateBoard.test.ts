import { describe, it, expect } from "vitest";
import { buildBoardFromTemplate, earliestTemplateDate, type TemplateSnapshot } from "@/lib/templateBoard";
import { toDateOnly } from "@/lib/gantt/dates";

function snapshot(): TemplateSnapshot {
  return {
    version: 1,
    board: {
      description: "Standard renovation",
      columns: [
        { id: "tl", title: "Timeline", type: "timeline" },
        { id: "due", title: "Due", type: "date" },
        { id: "who", title: "Owner", type: "people" },
        { id: "st", title: "Status", type: "status" },
        { id: "dep", title: "Depends on", type: "dependency" },
        { id: "note", title: "Notes", type: "text" },
        { id: "cost", title: "Budget", type: "numbers" },
        { id: "ms", title: "Milestone", type: "checkbox" },
      ],
      item_name_column: null,
      gantt_config: { timelineColumnId: "tl", targetFinish: "2026-03-20" },
    },
    groups: [
      { id: "g2", title: "Finishing", color: "#00c875", position: 1 },
      { id: "g1", title: "Demolition", color: "#e44258", position: 0 },
    ],
    items: [
      {
        id: "a",
        name: "Strip kitchen",
        group_id: "g1",
        position: 0,
        column_values: { tl: { start: "2026-03-02", end: "2026-03-04" }, note: "Skip ordered", cost: 1200, ms: true },
      },
      {
        id: "b",
        name: "Paint",
        group_id: "g2",
        position: 1,
        column_values: {
          tl: { start: "2026-03-10", end: "2026-03-12" },
          due: "2026-03-13",
          dep: ["a", "gone"],
          // The database strips these; a stale snapshot still must not carry them over.
          who: ["u1"],
          st: "Done",
        },
      },
    ],
    links: [
      { source_item_id: "a", target_item_id: "b", link_type: "dependency", dep_type: "FS", lag_days: 2 },
      { source_item_id: "a", target_item_id: "elsewhere", link_type: "dependency", dep_type: "FS", lag_days: 0 },
    ],
    automations: [
      {
        trigger_column_id: "st",
        trigger_value: "Done",
        action_type: "move_group",
        action_target_id: "g2",
        action_payload: { groupId: "g2" },
        enabled: true,
      },
    ],
  };
}

let n = 0;
const ids = () => `new-${++n}`;
const build = (start = new Date(2026, 8, 28)) =>
  buildBoardFromTemplate(snapshot(), { workspaceId: "ws", name: "Apt 12", startDay: start, newId: ids });

describe("buildBoardFromTemplate", () => {
  it("moves the earliest date to the start day and keeps durations and gaps", () => {
    const built = build();
    const [strip, paint] = built.items;
    expect(strip.column_values.tl).toEqual({ start: "2026-09-28", end: "2026-09-30" });
    expect(paint.column_values.tl).toEqual({ start: "2026-10-06", end: "2026-10-08" });
    expect(paint.column_values.due).toBe("2026-10-09");
    expect(built.board.gantt_config?.targetFinish).toBe("2026-10-16");
  });

  it("finds the earliest date across every date column", () => {
    expect(toDateOnly(earliestTemplateDate(snapshot())!)).toBe("2026-03-02");
  });

  it("clears people and statuses, keeps notes, numbers and milestones", () => {
    const [strip, paint] = build().items;
    expect(paint.column_values).not.toHaveProperty("who");
    expect(paint.column_values).not.toHaveProperty("st");
    expect(strip.column_values).toMatchObject({ note: "Skip ordered", cost: 1200, ms: true });
  });

  it("gives tasks and groups new ids and re-points everything at them", () => {
    const built = build();
    const [strip, paint] = built.items;
    const demolition = built.groups.find((g) => g.title === "Demolition")!;
    const finishing = built.groups.find((g) => g.title === "Finishing")!;
    expect(strip.group_id).toBe(demolition.id);
    expect(paint.group_id).toBe(finishing.id);
    // Groups keep their order, numbered from 0.
    expect(built.groups.map((g) => g.title)).toEqual(["Demolition", "Finishing"]);
    // The dependency column follows the task; a task outside the board is dropped.
    expect(paint.column_values.dep).toEqual([strip.id]);
    // Links keep their type and lag; one reaching outside the board is dropped.
    expect(built.links).toEqual([
      { source_item_id: strip.id, target_item_id: paint.id, link_type: "dependency", dep_type: "FS", lag_days: 2 },
    ]);
    // "Move to group" moves into the new board's group.
    expect(built.automations[0]).toMatchObject({ action_target_id: finishing.id, action_payload: { groupId: finishing.id } });
    expect(built.automations[0].board_id).toBe(built.board.id);
  });

  it("keeps column ids, so formulas, Gantt settings and automations still find their columns", () => {
    const built = build();
    expect(built.board.columns.map((c) => c.id)).toEqual(snapshot().board.columns.map((c) => c.id));
    expect(built.board.gantt_config?.timelineColumnId).toBe("tl");
    expect(built.automations[0].trigger_column_id).toBe("st");
  });

  it("copies a plan with no dates as it is", () => {
    const snap = snapshot();
    for (const item of snap.items) {
      delete item.column_values.tl;
      delete item.column_values.due;
    }
    snap.board.gantt_config = null;
    const built = buildBoardFromTemplate(snap, { workspaceId: "ws", name: "x", startDay: new Date(2026, 0, 1), newId: ids });
    expect(built.shiftDays).toBe(0);
    expect(built.items).toHaveLength(2);
  });

  it("puts tasks in a group of their own when the template has none", () => {
    const snap = snapshot();
    snap.groups = [];
    const built = buildBoardFromTemplate(snap, { workspaceId: "ws", name: "x", startDay: new Date(2026, 0, 1), newId: ids });
    expect(built.groups).toHaveLength(1);
    expect(new Set(built.items.map((i) => i.group_id))).toEqual(new Set([built.groups[0].id]));
  });

  it("does not change the snapshot it was given", () => {
    const snap = snapshot();
    const before = JSON.stringify(snap);
    buildBoardFromTemplate(snap, { workspaceId: "ws", name: "x", startDay: new Date(2026, 5, 1), newId: ids });
    expect(JSON.stringify(snap)).toBe(before);
  });
});
