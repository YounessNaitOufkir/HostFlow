import { describe, it, expect } from "vitest";
import type { Board, Item } from "@/types";
import type { GanttDependency } from "@/lib/gantt/dependencies";
import { dayIndex, parseDateOnly } from "@/lib/gantt/dates";
import { buildWaitingList } from "@/lib/mission/waiting";

const TODAY = dayIndex(parseDateOnly("2026-10-08")!);

const board = (id: string, workspace_id: string): Board => ({
  id,
  name: id,
  description: "",
  workspace_id,
  columns: [
    { id: "st", title: "Status", type: "status" },
    { id: "w", title: "Waiting on", type: "waiting_on" },
  ],
});
const b1 = board("b1", "ws-agdal");
const b2 = board("b2", "ws-finance");
const boards = new Map([b1, b2].map((b) => [b.id, b]));

let n = 0;
const task = (name: string, w: unknown, opts: { board?: Board; status?: string; deleted?: boolean; id?: string } = {}): Item => ({
  id: opts.id ?? `t${++n}`,
  name,
  group_id: "g",
  position: 0,
  board_id: (opts.board ?? b1).id,
  column_values: { w, ...(opts.status ? { st: opts.status } : {}) },
  deleted_at: opts.deleted ? "2026-10-01T00:00:00Z" : null,
});
const dep = (sourceId: string, targetId: string): GanttDependency => ({ id: `${sourceId}${targetId}`, sourceId, targetId, type: "FS", lag: 0 });
const w = (who: string, since: string, followUp: string | null = null) => ({ who, since, followUp });

describe("buildWaitingList", () => {
  it("groups by who, case- and space-insensitively, keeping the first spelling", () => {
    const list = buildWaitingList(
      [task("Virements", w("Banque", "2026-10-06")), task("Relevé", w(" banque ", "2026-10-07"), { board: b2 })],
      boards,
      [],
      TODAY
    );
    expect(list).toHaveLength(1);
    expect(list[0].who).toBe("Banque");
    expect(list[0].tasks).toHaveLength(2);
    expect(list[0].workspaceIds).toEqual(["ws-agdal", "ws-finance"]);
  });

  it("puts groups with a due follow-up first, then the oldest since", () => {
    const list = buildWaitingList(
      [
        task("a", w("Old", "2026-09-01")),
        task("b", w("Due", "2026-10-07", "2026-10-08")),
        task("c", w("Newer", "2026-10-05")),
      ],
      boards,
      [],
      TODAY
    );
    expect(list.map((g) => g.who)).toEqual(["Due", "Old", "Newer"]);
  });

  it("marks followUpDue when followUp <= today, and tracks the earliest follow-up", () => {
    const list = buildWaitingList(
      [task("past", w("X", "2026-10-01", "2026-10-07")), task("later", w("X", "2026-10-01", "2026-10-20")), task("none", w("Y", "2026-10-01"))],
      boards,
      [],
      TODAY
    );
    const x = list.find((g) => g.who === "X")!;
    expect(x.tasks.map((t) => [t.item.name, t.followUpDue])).toEqual([["past", true], ["later", false]]);
    expect(x.earliestFollowUp).toBe("2026-10-07");
    expect(x.anyDue).toBe(true);
    expect(list.find((g) => g.who === "Y")!.anyDue).toBe(false);
  });

  it("excludes done items and trashed items", () => {
    const list = buildWaitingList(
      [task("done", w("Banque", "2026-10-06"), { status: "Done" }), task("trash", w("Banque", "2026-10-06"), { deleted: true })],
      boards,
      [],
      TODAY
    );
    expect(list).toEqual([]);
  });

  it("ignores tasks with an empty or malformed waiting_on, and items on unknown boards", () => {
    const orphan = { ...task("orphan", w("Z", "2026-10-06")), board_id: "gone" };
    expect(buildWaitingList([task("e", null), task("m", "{bad"), orphan], boards, [], TODAY)).toEqual([]);
  });

  it("fills blocks from the open tasks downstream, skipping done ones", () => {
    const items = [
      task("Devis", w("Menuisier", "2026-10-03"), { id: "devis" }),
      task("Acompte", null, { id: "acompte" }),
      task("Pose", null, { id: "pose", status: "Done" }),
      task("Entrée", null, { id: "entree" }),
    ];
    const list = buildWaitingList(items, boards, [dep("devis", "acompte"), dep("acompte", "pose"), dep("pose", "entree")], TODAY);
    expect(list[0].tasks[0].blocks).toBe(2);
  });
});
