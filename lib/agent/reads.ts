import type { Board, Item, Workspace } from "@/types";
import { plotItemDates, assigneeIdsOf } from "@/lib/gantt/rows";
import { addDaysOnly, daysBetween, parseDateOnly, toDateOnly } from "@/lib/gantt/dates";
import { firstStatusValue, itemIsDone, itemStatusSemantic } from "@/lib/statusSemantics";
import { slipOf, type DelayNote } from "@/lib/delays";
import { boardLabel } from "@/lib/agent/resolve";

/**
 * What the connector's read tools answer, computed from rows already loaded.
 *
 * Pure, so the rules can be tested without a database: "open" is
 * `itemIsDone` (so "Fait" counts as done), dates are read exactly as the Gantt
 * plots them, and "today" is the organisation's today, passed in as
 * "YYYY-MM-DD" - never the server's clock.
 */

export type TaskRange = "today" | "week" | "overdue" | "all";

export type DueState = "overdue" | "today" | "upcoming" | "undated";

export interface TaskSummary {
  id: string;
  name: string;
  board: string;
  board_id: string;
  status: string | null;
  start: string | null;
  end: string | null;
  due: DueState;
  /** Days past the end date; only set when overdue. */
  days_late?: number;
}

/** One task as the tools report it, whatever its state. */
export function summarizeTask(item: Item, board: Board, workspaces: Workspace[], todayStr: string): TaskSummary {
  const plotted = plotItemDates(item, board);
  const start = plotted ? toDateOnly(plotted.start) : null;
  const end = plotted ? toDateOnly(plotted.end) : null;

  let due: DueState = "undated";
  let daysLate: number | undefined;
  if (start && end) {
    if (end < todayStr) {
      due = "overdue";
      daysLate = daysBetween(parseDateOnly(end)!, parseDateOnly(todayStr)!);
    } else if (start <= todayStr) {
      due = "today";
    } else {
      due = "upcoming";
    }
  }

  return {
    id: item.id,
    name: item.name,
    board: boardLabel(board, workspaces),
    board_id: board.id,
    status: firstStatusValue(board.columns ?? [], item.column_values),
    start,
    end,
    due,
    ...(daysLate !== undefined ? { days_late: daysLate } : {}),
  };
}

/** Not trashed and not finished. */
function isOpen(item: Item, board: Board): boolean {
  return !item.deleted_at && !itemIsDone(board.columns ?? [], item.column_values);
}

/**
 * The person's open tasks, as My Work defines "theirs": named in any people
 * column of the task's board.
 *
 * - today:   running today, plus anything overdue (still on today's plate)
 * - week:    running at some point in the next 7 days, plus overdue
 * - overdue: past their end date
 * - all:     every open task, dated or not
 */
export function myTasks(
  items: Item[],
  boards: Board[],
  workspaces: Workspace[],
  userId: string,
  todayStr: string,
  range: TaskRange
): TaskSummary[] {
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const weekEnd = toDateOnly(addDaysOnly(parseDateOnly(todayStr)!, 6));

  const out: TaskSummary[] = [];
  for (const item of items) {
    const board = boardById.get(item.board_id);
    if (!board || !isOpen(item, board)) continue;
    if (!assigneeIdsOf(item, board).includes(userId)) continue;

    const task = summarizeTask(item, board, workspaces, todayStr);
    const keep =
      range === "all" ||
      task.due === "overdue" ||
      (range === "today" && task.due === "today") ||
      (range === "week" && task.start !== null && task.start <= weekEnd && task.due !== "undated");
    if (keep) out.push(task);
  }

  return sortTasks(out);
}

/** Most late first, then by end date, undated last. */
function sortTasks(tasks: TaskSummary[]): TaskSummary[] {
  return tasks.sort((a, b) => {
    const lateA = a.days_late ?? -1;
    const lateB = b.days_late ?? -1;
    if (lateA !== lateB) return lateB - lateA;
    if (a.end && b.end) return a.end.localeCompare(b.end);
    if (a.end) return -1;
    if (b.end) return 1;
    return a.name.localeCompare(b.name);
  });
}

export interface DelaySummary extends TaskSummary {
  stuck: boolean;
  /** Days behind the agreed baseline, when one was captured. */
  behind_plan_days?: number;
  assignees: string[];
  /** Why it slipped, from the delay notes people wrote. */
  reasons: { days: number; category: string; note: string | null }[];
}

/**
 * Open tasks that are late, blocked or behind their baseline - across every
 * board passed in, so the caller decides the scope (one board, a workspace, or
 * everything the person can see).
 */
export function delays(
  items: Item[],
  boards: Board[],
  workspaces: Workspace[],
  notes: DelayNote[],
  names: Map<string, string>,
  todayStr: string
): DelaySummary[] {
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const notesByItem = new Map<string, DelayNote[]>();
  for (const note of notes) {
    const list = notesByItem.get(note.item_id) ?? [];
    list.push(note);
    notesByItem.set(note.item_id, list);
  }

  const out: DelaySummary[] = [];
  for (const item of items) {
    const board = boardById.get(item.board_id);
    if (!board || !isOpen(item, board)) continue;

    const task = summarizeTask(item, board, workspaces, todayStr);
    const stuck = itemStatusSemantic(board.columns ?? [], item.column_values) === "stuck";
    const slip = slipOf(item, board);
    const behind = slip !== null && slip > 0 ? slip : undefined;

    if (task.due !== "overdue" && !stuck && behind === undefined) continue;

    out.push({
      ...task,
      stuck,
      ...(behind !== undefined ? { behind_plan_days: behind } : {}),
      assignees: assigneeIdsOf(item, board).map((id) => names.get(id) ?? "Unknown"),
      reasons: (notesByItem.get(item.id) ?? []).map((n) => ({
        days: n.days,
        category: n.category,
        note: n.note,
      })),
    });
  }

  return out.sort(
    (a, b) =>
      (b.days_late ?? 0) + (b.behind_plan_days ?? 0) - ((a.days_late ?? 0) + (a.behind_plan_days ?? 0))
  );
}
