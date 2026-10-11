import type { Board, Item } from "@/types";
import type { GanttDependency } from "@/lib/gantt/dependencies";
import { dayIndex, parseDateOnly } from "@/lib/gantt/dates";
import { isOpenItem, waitingOnOf } from "@/lib/mission/fields";
import { openSuccessorCounts } from "@/lib/mission/graph";

/**
 * "En attente de": the open tasks that are waiting on someone outside the
 * task, grouped by who. Pure - the view, the digest and the connector all
 * call this, so they never disagree about who needs chasing.
 */

export interface WaitingTask {
  item: Item;
  board: Board;
  since: string;
  followUp: string | null;
  /** The follow-up date is today or already past. */
  followUpDue: boolean;
  /** Open tasks downstream of this one. */
  blocks: number;
}

export interface WaitingGroup {
  /** The first spelling met, so the card reads as the team typed it. */
  who: string;
  tasks: WaitingTask[];
  earliestFollowUp: string | null;
  anyDue: boolean;
  workspaceIds: string[];
}

/** "Banque", " banque " and "BANQUE" are the same bank. */
function whoKey(who: string): string {
  return who.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function dayOf(date: string): number {
  return dayIndex(parseDateOnly(date)!);
}

const byWaitingTask = (a: WaitingTask, b: WaitingTask) =>
  Number(b.followUpDue) - Number(a.followUpDue) || a.since.localeCompare(b.since) || a.item.name.localeCompare(b.item.name);

export function buildWaitingList(
  items: Item[],
  boardsById: Map<string, Board>,
  deps: GanttDependency[],
  todayIdx: number
): WaitingGroup[] {
  const openIds = new Set(items.filter((i) => isOpenItem(i, boardsById.get(i.board_id))).map((i) => i.id));
  const blocks = openSuccessorCounts(deps, (id) => openIds.has(id));

  const groups = new Map<string, WaitingGroup>();
  for (const item of items) {
    if (!openIds.has(item.id)) continue;
    const board = boardsById.get(item.board_id)!;
    const waiting = waitingOnOf(item, board);
    if (!waiting) continue;

    const key = whoKey(waiting.who);
    let group = groups.get(key);
    if (!group) {
      group = { who: waiting.who, tasks: [], earliestFollowUp: null, anyDue: false, workspaceIds: [] };
      groups.set(key, group);
    }

    const followUpDue = waiting.followUp !== null && dayOf(waiting.followUp) <= todayIdx;
    group.tasks.push({
      item,
      board,
      since: waiting.since,
      followUp: waiting.followUp,
      followUpDue,
      blocks: blocks.get(item.id) ?? 0,
    });
    if (followUpDue) group.anyDue = true;
    if (waiting.followUp && (!group.earliestFollowUp || waiting.followUp < group.earliestFollowUp)) {
      group.earliestFollowUp = waiting.followUp;
    }
    if (board.workspace_id && !group.workspaceIds.includes(board.workspace_id)) {
      group.workspaceIds.push(board.workspace_id);
    }
  }

  const list = Array.from(groups.values());
  for (const group of list) group.tasks.sort(byWaitingTask);
  // "yyyy-MM-dd" sorts as text in date order.
  const oldestSince = (g: WaitingGroup) => g.tasks.reduce((min, t) => (t.since < min ? t.since : min), g.tasks[0].since);
  // Someone to chase today first, then whoever has been waited on longest.
  list.sort(
    (a, b) =>
      Number(b.anyDue) - Number(a.anyDue) ||
      oldestSince(a).localeCompare(oldestSince(b)) ||
      a.who.localeCompare(b.who)
  );
  return list;
}
