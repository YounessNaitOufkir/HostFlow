import { describe, it, expect } from "vitest";
import type { Board, Column, Item, ItemLink, Workspace } from "@/types";
import { missionToday } from "@/lib/agent/service";

const TODAY = "2026-10-08";
const ME = "me";

const columns: Column[] = [
  { id: "tl", title: "Timeline", type: "timeline" },
  { id: "who", title: "Owner", type: "people" },
  { id: "st", title: "Status", type: "status" },
  { id: "w", title: "Waiting on", type: "waiting_on" },
  { id: "os", title: "On site", type: "on_site" },
];
const agdal: Board = { id: "b1", name: "Rénovation", workspace_id: "w1", description: "", columns };
const sale: Board = { id: "b2", name: "Sortie", workspace_id: "w2", description: "", columns };
const hidden: Board = { id: "b9", name: "Hors scope", workspace_id: "w9", description: "", columns };
const workspaces: Workspace[] = [
  { id: "w1", name: "Agdal T3", created_at: "" },
  { id: "w2", name: "Salé", created_at: "" },
];

function task(
  id: string,
  board: Board,
  values: { start?: string; end?: string; who?: string[]; status?: string; waiting?: unknown; onSite?: boolean }
): Item {
  return {
    id,
    name: id,
    group_id: "g1",
    board_id: board.id,
    position: 0,
    column_values: {
      ...(values.end ? { tl: { start: values.start ?? values.end, end: values.end } } : {}),
      ...(values.who ? { who: values.who } : {}),
      ...(values.status ? { st: values.status } : {}),
      ...(values.waiting ? { w: values.waiting } : {}),
      ...(values.onSite ? { os: true } : {}),
    },
  } as Item;
}

const link = (source: string, target: string): ItemLink => ({
  id: `${source}-${target}`,
  source_item_id: source,
  target_item_id: target,
  link_type: "dependency",
  created_at: "",
});

const linkFor = (boardId: string, itemId: string) => `https://app.test/?board=${boardId}&item=${itemId}`;
const run = (items: Item[], links: ItemLink[] = [], boards = [agdal, sale]) =>
  missionToday(items, links, boards, workspaces, ME, TODAY, linkFor);

describe("missionToday", () => {
  it("returns at most three of the person's own tasks, with reasons and links", () => {
    const result = run([
      task("Late 1", agdal, { end: "2026-10-01", who: [ME] }),
      task("Late 2", agdal, { end: "2026-10-02", who: [ME] }),
      task("Today", sale, { end: "2026-10-08", who: [ME] }),
      task("Soon", agdal, { end: "2026-10-09", who: [ME] }),
      task("Not mine", agdal, { end: "2026-09-01", who: ["other"] }),
    ]);
    expect(result.today).toBe(TODAY);
    expect(result.now.map((t) => t.task)).toEqual(["Late 1", "Late 2", "Today"]);
    expect(result.now[0]).toMatchObject({
      workspace: "Agdal T3",
      reasons: [{ kind: "overdue", days: 7 }],
      link: "https://app.test/?board=b1&item=Late 1",
    });
  });

  it("ignores boards outside the scope, even when a link points into them", () => {
    // Out of scope, a long chain behind "Blocker" would make it rank first.
    const chain = ["X1", "X2", "X3", "X4"].map((id) => task(id, hidden, { end: "2026-10-20", who: [ME] }));
    const result = run(
      [
        task("Blocker", agdal, { end: "2026-10-12", who: [ME] }),
        task("Due today", agdal, { end: "2026-10-08", who: [ME] }),
        task("Hidden late", hidden, { end: "2026-09-01", who: [ME] }),
        ...chain,
      ],
      [link("Blocker", "X1"), link("X1", "X2"), link("X2", "X3"), link("X3", "X4")]
    );
    expect(result.now.map((t) => t.task)).toEqual(["Due today", "Blocker"]);
    expect(result.now.find((t) => t.task === "Blocker")!.reasons).toEqual([{ kind: "dueSoon", days: 4 }]);
  });

  it("lists who the person's own tasks are waiting on, due follow-ups first", () => {
    const result = run([
      task("Devis", agdal, { who: [ME], waiting: { who: "Menuisier", since: "2026-10-01", followUp: "2026-10-08" } }),
      task("Virement", sale, { who: [ME], waiting: { who: "Banque", since: "2026-10-05", followUp: "2026-10-12" } }),
      task("Theirs", agdal, { who: ["other"], waiting: { who: "Plombier", since: "2026-10-01", followUp: null } }),
      task("Reçu", agdal, { who: [ME], status: "Done", waiting: { who: "Notaire", since: "2026-10-01", followUp: null } }),
    ]);
    expect(result.waiting).toEqual([
      { who: "Menuisier", follow_up_due: true, follow_up: "2026-10-08", tasks: ["Devis — Agdal T3"] },
      { who: "Banque", follow_up_due: false, follow_up: "2026-10-12", tasks: ["Virement — Salé"] },
    ]);
  });

  it("names the person's on-site conflicts by day, with the property", () => {
    const result = run([
      task("État des lieux", sale, { end: "2026-10-10", who: [ME], onSite: true }),
      task("Réception meubles", agdal, { end: "2026-10-10", who: [ME], onSite: true }),
      task("Ailleurs", sale, { end: "2026-10-11", who: ["other"], onSite: true }),
      task("Aussi ailleurs", agdal, { end: "2026-10-11", who: ["other"], onSite: true }),
    ]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].day).toBe("2026-10-10");
    expect([...result.conflicts[0].tasks].sort()).toEqual(["Réception meubles — Agdal T3", "État des lieux — Salé"].sort());
  });

  it("is empty, not wrong, on a day it cannot read", () => {
    const result = missionToday([], [], [agdal], workspaces, ME, "not a date", linkFor);
    expect(result).toEqual({ today: "not a date", now: [], waiting: [], conflicts: [] });
  });
});
