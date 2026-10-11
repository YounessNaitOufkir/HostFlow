import type { Board, Item } from "@/types";
import type { GanttDependency } from "@/lib/gantt/dependencies";
import { dayIndex, parseDateOnly } from "@/lib/gantt/dates";
import { assigneeIdsOf, plotItemDates } from "@/lib/gantt/rows";
import { computeSchedule, type ScheduleTaskInput } from "@/lib/gantt/schedule";
import { itemIsDone } from "@/lib/statusSemantics";
import { isOpenItem, waitingOnOf } from "@/lib/mission/fields";
import { openSuccessorCounts } from "@/lib/mission/graph";

/**
 * "Maintenant": the open tasks that cost the most if nobody acts today, ranked.
 *
 * Pure. The Pilotage view, the morning digest and the Claude connector all call
 * this one function, so the three never disagree about what matters.
 *
 * score = urgency (due date) + slack (Gantt float) + unblocks (open tasks
 * downstream) + follow-up (a wait whose chase date has come). Each part is a
 * named constant so the weights can be tuned in one place.
 */

export const NOW_LIMIT = 3;

export const URGENCY_OVERDUE = 40;
export const URGENCY_TODAY = 30;
export const URGENCY_2_DAYS = 20;
export const URGENCY_7_DAYS = 10;

export const SLACK_NONE = 25; // float <= 0
export const SLACK_2_DAYS = 15; // float <= 2
export const SLACK_5_DAYS = 5; // float <= 5

export const POINTS_PER_SUCCESSOR = 3;
export const SUCCESSOR_CAP = 10;

export const FOLLOW_UP_DUE = 10;

/** Slack up to this many days is worth showing as a reason. */
const FLOAT_REASON_MAX = 5;

export type NowReason =
  | { kind: "overdue"; days: number }
  | { kind: "dueToday" }
  | { kind: "dueSoon"; days: number }
  | { kind: "critical" }
  | { kind: "float"; days: number }
  | { kind: "unblocks"; count: number }
  | { kind: "followUp"; who: string };

export interface RankedTask {
  item: Item;
  board: Board;
  score: number;
  /** In display order: urgency, critical, float, unblocks, follow-up. */
  reasons: NowReason[];
  /** Due day as a dayIndex, or null when the task has no date. */
  dueIdx: number | null;
  /** Open tasks downstream. */
  successors: number;
}

export interface MissionInput {
  items: Item[];
  boardsById: Map<string, Board>;
  deps: GanttDependency[];
  todayIdx: number;
}

function urgencyOf(dueIdx: number | null, todayIdx: number): { points: number; reason: NowReason | null } {
  if (dueIdx === null) return { points: 0, reason: null };
  const days = dueIdx - todayIdx;
  if (days < 0) return { points: URGENCY_OVERDUE, reason: { kind: "overdue", days: -days } };
  if (days === 0) return { points: URGENCY_TODAY, reason: { kind: "dueToday" } };
  if (days <= 2) return { points: URGENCY_2_DAYS, reason: { kind: "dueSoon", days } };
  if (days <= 7) return { points: URGENCY_7_DAYS, reason: { kind: "dueSoon", days } };
  return { points: 0, reason: null };
}

function slackPoints(totalFloat: number): number {
  if (totalFloat <= 0) return SLACK_NONE;
  if (totalFloat <= 2) return SLACK_2_DAYS;
  if (totalFloat <= 5) return SLACK_5_DAYS;
  return 0;
}

/**
 * Every open task with a score above zero, best first. With `personId`, only
 * that person's tasks - the digest's privacy rule. Ties: sooner due date, then
 * more tasks unblocked, then name.
 */
export function rankNow(input: MissionInput, opts: { personId?: string } = {}): RankedTask[] {
  const { items, boardsById, deps, todayIdx } = input;

  const openIds = new Set(items.filter((i) => isOpenItem(i, boardsById.get(i.board_id))).map((i) => i.id));
  const successors = openSuccessorCounts(deps, (id) => openIds.has(id));

  // Only tasks tied into the plan get a slack score. In "project" scope an
  // unlinked task's float is just its distance from the board's last date,
  // which would call any lone task that happens to end last "critical".
  const linked = new Set<string>();
  for (const d of deps) {
    linked.add(d.sourceId);
    linked.add(d.targetId);
  }

  // Done tasks are scheduled too: they still hold back what waits on them.
  const dates = new Map<string, { start: number; end: number }>();
  const scheduleInput: ScheduleTaskInput[] = [];
  for (const item of items) {
    const board = boardsById.get(item.board_id);
    if (!board || item.deleted_at) continue;
    const plotted = plotItemDates(item, board);
    if (!plotted) continue;
    const start = dayIndex(plotted.start);
    const end = dayIndex(plotted.end);
    dates.set(item.id, { start, end });
    const target = parseDateOnly(board.gantt_config?.targetFinish ?? null);
    scheduleInput.push({
      id: item.id,
      start,
      end,
      scopeId: board.id,
      done: itemIsDone(board.columns ?? [], item.column_values),
      finishNoEarlierThan: todayIdx,
      ...(target ? { targetFinish: dayIndex(target) } : {}),
    });
  }
  const schedule = computeSchedule(scheduleInput, deps, { scope: "project" });

  const ranked: RankedTask[] = [];
  for (const item of items) {
    if (!openIds.has(item.id)) continue;
    const board = boardsById.get(item.board_id)!;
    if (opts.personId && !assigneeIdsOf(item, board).includes(opts.personId)) continue;

    const reasons: NowReason[] = [];
    let score = 0;

    const dueIdx = dates.get(item.id)?.end ?? null;
    const urgency = urgencyOf(dueIdx, todayIdx);
    score += urgency.points;
    if (urgency.reason) reasons.push(urgency.reason);

    const task = schedule.tasks.get(item.id);
    if (task && linked.has(item.id) && !task.unlinked && !task.inCycle) {
      score += slackPoints(task.totalFloat);
      if (task.isCritical) reasons.push({ kind: "critical" });
      // Negative float is kept: the plan runs past its target by that many days.
      if (task.totalFloat <= FLOAT_REASON_MAX) reasons.push({ kind: "float", days: task.totalFloat });
    }

    const count = successors.get(item.id) ?? 0;
    score += POINTS_PER_SUCCESSOR * Math.min(count, SUCCESSOR_CAP);
    if (count > 0) reasons.push({ kind: "unblocks", count });

    const waiting = waitingOnOf(item, board);
    const followUp = waiting?.followUp ? parseDateOnly(waiting.followUp) : null;
    if (waiting && followUp && dayIndex(followUp) <= todayIdx) {
      score += FOLLOW_UP_DUE;
      reasons.push({ kind: "followUp", who: waiting.who });
    }

    if (score > 0) ranked.push({ item, board, score, reasons, dueIdx, successors: count });
  }

  return ranked.sort(
    (a, b) =>
      b.score - a.score ||
      (a.dueIdx ?? Infinity) - (b.dueIdx ?? Infinity) ||
      b.successors - a.successors ||
      a.item.name.localeCompare(b.item.name)
  );
}
