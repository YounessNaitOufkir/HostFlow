import type { Board, Item } from "@/types";
import { dayIndex } from "@/lib/gantt/dates";
import { assigneeIdsOf, plotItemDates } from "@/lib/gantt/rows";
import { isOnSite, isOpenItem } from "@/lib/mission/fields";

/**
 * One person due on site at two properties on the same day.
 *
 * A workspace is one property, so two on-site tasks in the same workspace on
 * the same day are one trip, not a conflict. Pure.
 */

export type RankedLike = { item: Item; board: Board };

export interface OnSiteConflict {
  personId: string;
  dayIdx: number;
  tasks: [RankedLike, RankedLike];
}

interface Visit extends RankedLike {
  place: string;
  start: number;
  end: number;
  people: string[];
}

/**
 * Every pair of open on-site tasks sharing an assignee and a day within
 * [fromIdx, fromIdx + days), at different properties. Each pair is reported
 * once - on its first shared day, under the first person they share - sorted
 * by day, then person.
 */
export function findOnSiteConflicts(
  items: Item[],
  boardsById: Map<string, Board>,
  fromIdx: number,
  days = 7
): OnSiteConflict[] {
  const toIdx = fromIdx + days - 1;
  const visits: Visit[] = [];
  for (const item of items) {
    const board = boardsById.get(item.board_id);
    if (!board || !isOpenItem(item, board) || !isOnSite(item, board)) continue;
    const plotted = plotItemDates(item, board);
    if (!plotted) continue;
    const start = Math.max(dayIndex(plotted.start), fromIdx);
    const end = Math.min(dayIndex(plotted.end), toIdx);
    if (start > end) continue;
    const people = assigneeIdsOf(item, board);
    if (!people.length) continue;
    visits.push({ item, board, place: board.workspace_id ?? board.id, start, end, people: [...people].sort() });
  }

  const conflicts: OnSiteConflict[] = [];
  for (let i = 0; i < visits.length; i++) {
    for (let j = i + 1; j < visits.length; j++) {
      const a = visits[i];
      const b = visits[j];
      if (a.place === b.place) continue;
      const first = Math.max(a.start, b.start);
      if (first > Math.min(a.end, b.end)) continue;
      const personId = a.people.find((p) => b.people.includes(p));
      if (!personId) continue;
      conflicts.push({ personId, dayIdx: first, tasks: [{ item: a.item, board: a.board }, { item: b.item, board: b.board }] });
    }
  }
  return conflicts.sort((x, y) => x.dayIdx - y.dayIdx || x.personId.localeCompare(y.personId));
}
