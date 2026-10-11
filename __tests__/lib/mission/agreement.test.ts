import { describe, it, expect } from "vitest";
import type { Board, Item, ItemLink, Workspace } from "@/types";
import { addDaysOnly, dayIndex, parseDateOnly, toDateOnly } from "@/lib/gantt/dates";
import { collectDependencies } from "@/lib/gantt/dependencies";
import { NOW_LIMIT, rankNow } from "@/lib/mission/score";
import { nowByUser } from "@/lib/mission/digest";
import { missionToday } from "@/lib/agent/service";

/**
 * The plan's promise: on a given day, a person's top three is the same in the
 * Pilotage view, the morning digest and the Claude tool. Each computes it its
 * own way around rankNow, so this checks the three wrappers agree.
 */

const TODAY = "2026-10-08";
const TODAY_DATE = parseDateOnly(TODAY)!;
const day = (offset: number) => toDateOnly(addDaysOnly(TODAY_DATE, offset));

const columns = [
  { id: "tl", title: "Timeline", type: "timeline" },
  { id: "p", title: "Owner", type: "people" },
  { id: "p2", title: "Backup", type: "people" },
  { id: "st", title: "Status", type: "status" },
  { id: "w", title: "Waiting on", type: "waiting_on" },
] as Board["columns"];
const boards: Board[] = [
  { id: "b1", name: "Rénovation", workspace_id: "w1", description: "", columns },
  { id: "b2", name: "Sortie", workspace_id: "w2", description: "", columns, gantt_config: { targetFinish: day(12) } } as Board,
];
const workspaces: Workspace[] = [
  { id: "w1", name: "Agdal T3", created_at: "" },
  { id: "w2", name: "Salé", created_at: "" },
];

const item = (id: string, board: string, end: number, values: Record<string, unknown>): Item =>
  ({
    id,
    name: id,
    board_id: board,
    group_id: "g",
    position: 0,
    column_values: { tl: { start: day(end - 1), end: day(end) }, ...values },
  }) as Item;

const items: Item[] = [
  item("Devis", "b1", 1, { p: ["u1"] }),
  item("Commande", "b1", 4, { p: ["u2"] }),
  item("Pose", "b1", 8, { p: ["u1", "u2"] }),
  item("Peinture", "b1", 10, { p: ["u2"] }),
  item("Relance banque", "b2", 5, { p: ["u1"], w: { who: "Banque", since: day(-6), followUp: day(-1) } }),
  item("État des lieux", "b2", 3, { p: ["u2"], p2: ["u1"] }),
  item("Ménage", "b2", 0, { p: ["u1"] }),
  item("Clés", "b2", -2, { p: ["u2"], st: "Done" }),
  item("Photos", "b2", -3, { p: ["u1"] }),
  item("Annonce", "b2", 12, { p: ["u1"] }),
];
const link = (source: string, target: string): ItemLink =>
  ({ id: `${source}-${target}`, source_item_id: source, target_item_id: target, link_type: "dependency" }) as ItemLink;
const links = [link("Devis", "Commande"), link("Commande", "Pose"), link("Pose", "Peinture"), link("Ménage", "Annonce")];

describe("the top three agree", () => {
  it.each(["u1", "u2"])("for %s, across the view, the digest and Claude", (userId) => {
    const boardsById = new Map(boards.map((b) => [b.id, b]));
    const deps = collectDependencies(items, boardsById, links);
    const todayIdx = dayIndex(TODAY_DATE);

    // MissionControlView, "Mine".
    const view = rankNow({ items, boardsById, deps, todayIdx }, { personId: userId })
      .slice(0, NOW_LIMIT)
      .map((t) => t.item.id);
    const digest = nowByUser(items, boards, links, todayIdx, [userId]).get(userId)!.map((t) => t.item.id);
    const claude = missionToday(items, links, boards, workspaces, userId, TODAY, () => "").now.map((t) => t.id);

    expect(view).toHaveLength(NOW_LIMIT);
    expect(digest).toEqual(view);
    expect(claude).toEqual(view);
  });
});
