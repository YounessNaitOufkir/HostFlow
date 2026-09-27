/**
 * A board's project review: how it went against the plan, and why.
 *
 * Everything is read from the baseline (what was agreed), the tasks' dates
 * (what happened, or is now expected) and the delay notes (why). The point is
 * the next project: which reasons cost the most days, which delays actually
 * moved the finish, and what was added after the plan was set.
 */

import type { Board, Group, Item } from "@/types";
import { buildGanttRows, type GanttItemRow } from "@/lib/gantt/rows";
import { collectDependencies } from "@/lib/gantt/dependencies";
import { computeSchedule } from "@/lib/gantt/schedule";
import { dayIndex, daysBetween } from "@/lib/gantt/dates";
import type { ItemLink } from "@/types";
import {
  DELAY_CATEGORIES,
  unexplainedDays,
  slipParts,
  type DelayCategory,
  type DelayNote,
} from "@/lib/delays";

export interface ReviewTask {
  item: Item;
  name: string;
  groupTitle: string;
  plannedEnd: Date;
  end: Date;
  /** Days after (positive) or before (negative) the planned end. */
  slip: number;
  /** Of a late slip, the days pushed onto it by late tasks it waits on. */
  inherited: number;
  /** The days it lost itself: what its notes should explain. */
  own: number;
  notes: DelayNote[];
  unexplained: number;
  /** On the chain that set the finish date, as the dates now stand. */
  movedFinish: boolean;
  done: boolean;
}

export interface ProjectReview {
  state: "noDates" | "noBaseline" | "ready";
  /** Every task is done: the finish is what happened, not a forecast. */
  finished: boolean;
  plannedFinish: Date | null;
  finish: Date | null;
  /** Finish minus planned finish, in days. */
  finishSlip: number;
  taskCount: number;
  baselinedCount: number;
  late: ReviewTask[];
  early: ReviewTask[];
  /** Days lost per reason, from the notes on late tasks, largest first. */
  lostByReason: { category: DelayCategory; days: number }[];
  /** Late days no note accounts for. */
  unexplainedTotal: number;
  /** Notes grouped by reason, in the order of lostByReason. */
  lessons: { category: DelayCategory; notes: { note: DelayNote; taskName: string }[] }[];
  /** Tasks with dates but no baseline while others have one: work added after the plan. */
  addedAfterPlan: { item: Item; name: string; end: Date }[];
}

export function buildProjectReview({
  board,
  groups,
  items,
  itemLinks = [],
  notes,
}: {
  board: Board;
  groups: Group[];
  items: Item[];
  itemLinks?: ItemLink[];
  notes: DelayNote[];
}): ProjectReview {
  const live = items.filter((i) => !i.deleted_at);
  const { byItemId } = buildGanttRows({ contexts: [{ board, groups, items: live }] });
  const rows = Array.from(byItemId.values());

  const empty: ProjectReview = {
    state: "noDates",
    finished: false,
    plannedFinish: null,
    finish: null,
    finishSlip: 0,
    taskCount: rows.length,
    baselinedCount: 0,
    late: [],
    early: [],
    lostByReason: [],
    unexplainedTotal: 0,
    lessons: [],
    addedAfterPlan: [],
  };
  if (rows.length === 0) return empty;

  const baselined = rows.filter((r) => r.baseline);
  if (baselined.length === 0) return { ...empty, state: "noBaseline" };

  // The chain that set the finish, on the dates as they stand. Done flags and
  // today are left out on purpose: for a finished project every task is done,
  // and this has to say which of them decided when it ended.
  const dependencies = collectDependencies(live, new Map([[board.id, board]]), itemLinks);
  const schedule = computeSchedule(
    rows.map((r) => ({ id: r.item.id, start: dayIndex(r.start), end: dayIndex(r.end) })),
    dependencies
  );

  const notesByItem = new Map<string, DelayNote[]>();
  for (const note of notes) {
    const list = notesByItem.get(note.item_id);
    if (list) list.push(note);
    else notesByItem.set(note.item_id, [note]);
  }

  const groupTitle = new Map(groups.map((g) => [g.id, g.title]));
  const parts = slipParts(
    rows.map((r) => ({
      id: r.item.id,
      start: r.start,
      end: r.end,
      baseStart: r.baseline?.start ?? null,
      baseEnd: r.baseline?.end ?? null,
    })),
    dependencies
  );

  const toTask = (r: GanttItemRow): ReviewTask => {
    const plannedEnd = r.baseline!.end;
    const slip = daysBetween(plannedEnd, r.end);
    const part = parts.get(r.item.id);
    const inherited = part?.inherited ?? 0;
    const own = part?.own ?? slip;
    const taskNotes = notesByItem.get(r.item.id) ?? [];
    return {
      item: r.item,
      name: r.label,
      groupTitle: groupTitle.get(r.item.group_id) ?? "",
      plannedEnd,
      end: r.end,
      slip,
      inherited,
      own,
      notes: taskNotes,
      // Only its own days want a reason; what it inherited is explained where
      // it started.
      unexplained: unexplainedDays(slip > 0 ? Math.max(0, own) : slip, taskNotes),
      movedFinish: !!schedule.tasks.get(r.item.id)?.isCritical,
      done: r.isDone,
    };
  };

  const tasks = baselined.map(toTask);
  const late = tasks.filter((t) => t.slip > 0).sort((a, b) => b.slip - a.slip);
  const early = tasks.filter((t) => t.slip < 0).sort((a, b) => a.slip - b.slip);

  const plannedFinish = baselined.reduce<Date>(
    (latest, r) => (r.baseline!.end > latest ? r.baseline!.end : latest),
    baselined[0].baseline!.end
  );
  const finish = rows.reduce<Date>((latest, r) => (r.end > latest ? r.end : latest), rows[0].end);

  // Only notes on tasks that are late count as days lost: a note left on a
  // task that has since caught up describes a delay that no longer stands.
  const lost = new Map<DelayCategory, number>();
  for (const task of late) {
    for (const note of task.notes) {
      if (note.days > 0) lost.set(note.category, (lost.get(note.category) ?? 0) + note.days);
    }
  }
  const lostByReason = Array.from(lost, ([category, days]) => ({ category, days })).sort(
    (a, b) => b.days - a.days || DELAY_CATEGORIES.indexOf(a.category) - DELAY_CATEGORIES.indexOf(b.category)
  );

  const nameOf = new Map(rows.map((r) => [r.item.id, r.label]));
  const lessonMap = new Map<DelayCategory, { note: DelayNote; taskName: string }[]>();
  for (const note of notes) {
    if (!nameOf.has(note.item_id)) continue;
    const list = lessonMap.get(note.category) ?? [];
    list.push({ note, taskName: nameOf.get(note.item_id)! });
    lessonMap.set(note.category, list);
  }
  const order = [
    ...lostByReason.map((r) => r.category),
    ...DELAY_CATEGORIES.filter((c) => !lost.has(c)),
  ];
  const lessons = order
    .filter((c) => lessonMap.has(c))
    .map((category) => ({ category, notes: lessonMap.get(category)! }));

  return {
    state: "ready",
    finished: rows.every((r) => r.isDone),
    plannedFinish,
    finish,
    finishSlip: daysBetween(plannedFinish, finish),
    taskCount: rows.length,
    baselinedCount: baselined.length,
    late,
    early,
    lostByReason,
    unexplainedTotal: late.reduce((sum, t) => sum + Math.max(0, t.unexplained), 0),
    lessons,
    addedAfterPlan: rows
      .filter((r) => !r.baseline)
      .map((r) => ({ item: r.item, name: r.label, end: r.end })),
  };
}

