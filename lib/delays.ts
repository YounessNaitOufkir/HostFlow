/**
 * Delay notes: why a task ran past its baseline.
 *
 * A baseline freezes the agreed plan; the "+4d" beside a bar says a task has
 * drifted from it. On its own that number teaches nothing once the project is
 * over. A delay note records why, in a category that can be added up across
 * projects and a sentence for the detail, so the next apartment is planned
 * with the last one's lessons.
 */

import type { Board, Item, ItemLink } from "@/types";
import { collectDependencies } from "@/lib/gantt/dependencies";
import type { TranslationKey } from "@/lib/i18n";
import { plotItemDates } from "@/lib/gantt/rows";
import { daysBetween, parseDateOnly } from "@/lib/gantt/dates";

export const DELAY_CATEGORIES = [
  "supplier",
  "contractor",
  "client_change",
  "underestimated",
  "permits",
  "rework",
  "other",
] as const;

export type DelayCategory = (typeof DELAY_CATEGORIES)[number];

export const DELAY_CATEGORY_KEYS: Record<DelayCategory, TranslationKey> = {
  supplier: "delay.cat.supplier",
  contractor: "delay.cat.contractor",
  client_change: "delay.cat.clientChange",
  underestimated: "delay.cat.underestimated",
  permits: "delay.cat.permits",
  rework: "delay.cat.rework",
  other: "delay.cat.other",
};

export interface DelayNote {
  id: string;
  item_id: string;
  board_id: string;
  /** Days this slip added. Negative for a note on finishing early. */
  days: number;
  category: DelayCategory;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DelayNoteInput {
  itemId: string;
  boardId: string;
  days: number;
  category: DelayCategory;
  note: string;
}

/**
 * How far a task's end is from its baseline end, in days: positive when it
 * now finishes later than agreed. Null when there is nothing to compare - no
 * baseline, or no date the Gantt can plot. The end is read exactly as the
 * Gantt reads it, so the number matches the "+4d" beside the bar.
 */
export function slipOf(item: Item, board: Board): number | null {
  const baselineEnd = parseDateOnly(item.baseline?.end);
  if (!baselineEnd) return null;
  const plotted = plotItemDates(item, board);
  if (!plotted) return null;
  return daysBetween(baselineEnd, plotted.end);
}

/** The days of a slip no note accounts for yet; zero once they all are. */
export function unexplainedDays(slip: number | null, notes: DelayNote[]): number {
  if (!slip) return 0;
  const explained = notes.reduce((sum, n) => sum + n.days, 0);
  // Late: what is left of the delay. Early: what is left of the gain.
  return slip > 0 ? Math.max(0, slip - explained) : Math.min(0, slip - explained);
}

/**
 * The days an edit pushed a task further behind its plan, or 0.
 *
 * Measured past the later of the plan and where the task already was, so
 * moving a late task later by a day asks about that day, and pulling a late
 * task back in never asks at all.
 */
export function newlyLateDays(before: Item, after: Item, board: Board): number {
  const was = slipOf(before, board);
  const now = slipOf(after, board);
  if (now === null || now <= 0) return 0;
  return Math.max(0, now - Math.max(0, was ?? 0));
}

export function isDelayCategory(value: unknown): value is DelayCategory {
  return typeof value === "string" && (DELAY_CATEGORIES as readonly string[]).includes(value);
}

/** A task's dates beside its baseline, as the Gantt reads them. */
export interface SlipInput {
  id: string;
  start: Date;
  end: Date;
  baseStart: Date | null;
  baseEnd: Date | null;
}

export interface SlipParts {
  /** End against the planned end: the "+6d" beside the bar. */
  slip: number;
  /** Days of that pushed onto it by late tasks it waits on. */
  inherited: number;
  /** Days it lost itself: the part a reason can explain. */
  own: number;
}

/**
 * How much of each task's slip is its own.
 *
 * A task that waits on a late one starts late through no fault of its own:
 * counting that again would add the same lost days up once per task down the
 * chain, and ask for a reason nobody on that task has. So a task inherits the
 * days its start was pushed, up to the latest its predecessors ran; whatever
 * slip is left over is its own.
 *
 * Its predecessors are its dependency links when it has any. A task with none
 * is taken to wait on whatever was planned to finish before it started - how
 * a renovation runs, demolition before plumbing before tiles - since many
 * boards are planned in sequence without ever being linked.
 */
export function slipParts(
  tasks: SlipInput[],
  dependencies: { sourceId: string; targetId: string }[]
): Map<string, SlipParts> {
  const endSlip = new Map<string, number>();
  for (const task of tasks) {
    if (task.baseEnd) endSlip.set(task.id, daysBetween(task.baseEnd, task.end));
  }
  const predecessorsOf = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = predecessorsOf.get(dep.targetId);
    if (list) list.push(dep.sourceId);
    else predecessorsOf.set(dep.targetId, [dep.sourceId]);
  }

  const parts = new Map<string, SlipParts>();
  for (const task of tasks) {
    const slip = endSlip.get(task.id);
    if (slip === undefined) continue;
    const linked = predecessorsOf.get(task.id);
    const earlier = linked?.length
      ? linked
      : task.baseStart
        ? tasks
            .filter((other) => other.id !== task.id && other.baseEnd && other.baseEnd < task.baseStart!)
            .map((other) => other.id)
        : [];
    const pushedBy = Math.max(0, ...earlier.map((id) => endSlip.get(id) ?? 0));
    const startSlip = task.baseStart ? daysBetween(task.baseStart, task.start) : 0;
    const inherited = Math.max(0, Math.min(startSlip, pushedBy, Math.max(0, slip)));
    parts.set(task.id, { slip, inherited, own: slip - inherited });
  }
  return parts;
}

/** slipParts for every dated task on one board, from its items and links. */
export function boardSlipParts(board: Board, items: Item[], links: ItemLink[]): Map<string, SlipParts> {
  const live = items.filter((i) => !i.deleted_at);
  const tasks: SlipInput[] = [];
  for (const item of live) {
    const plotted = plotItemDates(item, board);
    if (!plotted) continue;
    tasks.push({
      id: item.id,
      start: plotted.start,
      end: plotted.end,
      baseStart: parseDateOnly(item.baseline?.start),
      baseEnd: parseDateOnly(item.baseline?.end),
    });
  }
  return slipParts(tasks, collectDependencies(live, new Map([[board.id, board]]), links));
}
