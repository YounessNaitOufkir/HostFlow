import type { Board, Item, ItemLink } from "@/types";
import { collectDependencies } from "@/lib/gantt/dependencies";
import { assigneeIdsOf } from "@/lib/gantt/rows";
import { NOW_LIMIT, rankNow, type RankedTask } from "@/lib/mission/score";

/**
 * The digest's « Maintenant » section, for every reader at once.
 *
 * Ranked once over the whole company, then split by assignee: the same order
 * the Pilotage view shows under "Mine", without scheduling the plan once per
 * person. A reader only ever gets their own tasks.
 */
export function nowByUser(
  items: Item[],
  boards: Board[],
  itemLinks: ItemLink[],
  todayIdx: number,
  userIds: Iterable<string>,
  limit: number = NOW_LIMIT
): Map<string, RankedTask[]> {
  const boardsById = new Map(boards.map((b) => [b.id, b]));
  const deps = collectDependencies(items, boardsById, itemLinks);
  const ranked = rankNow({ items, boardsById, deps, todayIdx });

  const byUser = new Map<string, RankedTask[]>();
  for (const id of userIds) byUser.set(id, []);

  for (const task of ranked) {
    for (const id of assigneeIdsOf(task.item, task.board)) {
      const list = byUser.get(id);
      if (list && list.length < limit) list.push(task);
    }
  }
  return byUser;
}
