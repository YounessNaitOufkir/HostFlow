/**
 * Lessons across projects: what past apartments teach the next one.
 *
 * Each board is a project, reviewed on its own by buildProjectReview. This
 * adds them up: which reasons cost the most days, which kinds of task run long
 * again and again, and how each project finished against its plan. The same
 * task-type figures feed the hint shown while someone plans a new task.
 */

import type { Board, Group, Item, Workspace } from "@/types";
import { buildProjectReview, type ProjectReview } from "@/lib/projectReview";
import { daysBetween, parseDateOnly } from "@/lib/gantt/dates";
import { plotItemDates } from "@/lib/gantt/rows";
import {
  DELAY_CATEGORIES,
  type DelayCategory,
  type DelayNote,
} from "@/lib/delays";

/** A task type needs this many projects before it is advice rather than anecdote. */
export const ADVICE_MIN_PROJECTS = 3;
/** And must run over by at least this many days on average. */
export const ADVICE_MIN_OVERRUN = 1;
const TABLE_MIN_PROJECTS = 2;
const TABLE_LIMIT = 10;
const ADVICE_LIMIT = 4;

export type LessonsPeriod = "6m" | "12m" | "all";

export interface LessonsFilter {
  includeInProgress: boolean;
  period: LessonsPeriod;
  /** One workspace, or null for all. */
  workspaceId: string | null;
}

export const DEFAULT_LESSONS_FILTER: LessonsFilter = {
  includeInProgress: false,
  period: "12m",
  workspaceId: null,
};

export interface LessonProject {
  board: Board;
  workspace: Workspace | null;
  review: ProjectReview;
  plannedDays: number;
  actualDays: number;
  /** Days lost across its late tasks. */
  daysLost: number;
  /** Share of daysLost that has a reason, 0-100; null when nothing was lost. */
  explainedPct: number | null;
  topReason: DelayCategory | null;
}

export interface TaskTypeRun {
  project: LessonProject;
  item: Item;
  plannedDays: number;
  actualDays: number;
  notes: DelayNote[];
}

export interface TaskType {
  key: string;
  name: string;
  runs: TaskTypeRun[];
  projectCount: number;
  plannedAvg: number;
  actualAvg: number;
  overrunAvg: number;
  lateRuns: number;
  topReason: DelayCategory | null;
}

export interface LessonsSummary {
  projects: LessonProject[];
  onTimeCount: number;
  finishSlipAvg: number | null;
  daysLost: number;
  lateTaskCount: number;
  explainedDays: number;
  lostByReason: { category: DelayCategory; days: number; byProject: { name: string; days: number }[] }[];
  unexplainedTotal: number;
  /** The types that run long, longest first: the table. */
  taskTypes: TaskType[];
  advice: TaskType[];
  /** Every type seen in 2+ projects, by key: what the planning hint reads. */
  typeIndex: Map<string, TaskType>;
}

/** "Électricité ", "electricite" and "ÉLECTRICITÉ" are the same kind of task. */
export function taskTypeKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const inclusiveDays = (start: Date, end: Date) => daysBetween(start, end) + 1;

function periodStart(period: LessonsPeriod, now: Date): Date | null {
  if (period === "all") return null;
  const months = period === "6m" ? 6 : 12;
  return new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
}

function topOf(days: Map<DelayCategory, number>): DelayCategory | null {
  let best: DelayCategory | null = null;
  for (const category of DELAY_CATEGORIES) {
    const value = days.get(category) ?? 0;
    if (value > 0 && (best === null || value > (days.get(best) ?? 0))) best = category;
  }
  return best;
}

export function computeLessons({
  workspaces,
  boards,
  groups,
  items,
  notes,
  filter,
  now = new Date(),
}: {
  workspaces: Workspace[];
  boards: Board[];
  groups: Group[];
  items: Item[];
  notes: DelayNote[];
  filter: LessonsFilter;
  now?: Date;
}): LessonsSummary {
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));
  const since = periodStart(filter.period, now);

  const itemsByBoard = new Map<string, Item[]>();
  for (const item of items) {
    const list = itemsByBoard.get(item.board_id);
    if (list) list.push(item);
    else itemsByBoard.set(item.board_id, [item]);
  }
  const groupsByBoard = new Map<string, Group[]>();
  for (const group of groups) {
    const list = groupsByBoard.get(group.board_id);
    if (list) list.push(group);
    else groupsByBoard.set(group.board_id, [group]);
  }
  const notesByBoard = new Map<string, DelayNote[]>();
  for (const note of notes) {
    const list = notesByBoard.get(note.board_id);
    if (list) list.push(note);
    else notesByBoard.set(note.board_id, [note]);
  }

  // ---- one review per board, kept when it passes the filter
  const projects: LessonProject[] = [];
  for (const board of boards) {
    if (filter.workspaceId && board.workspace_id !== filter.workspaceId) continue;
    const review = buildProjectReview({
      board,
      groups: groupsByBoard.get(board.id) ?? [],
      items: itemsByBoard.get(board.id) ?? [],
      notes: notesByBoard.get(board.id) ?? [],
    });
    if (review.state !== "ready") continue;
    if (!review.finished && !filter.includeInProgress) continue;
    if (since && review.finish! < since) continue;

    const baselined = (itemsByBoard.get(board.id) ?? []).filter((i) => i.baseline && !i.deleted_at);
    const plannedStart = baselined
      .map((i) => parseDateOnly(i.baseline!.start))
      .filter((d): d is Date => !!d)
      .reduce<Date | null>((a, b) => (!a || b < a ? b : a), null);
    const start = (itemsByBoard.get(board.id) ?? [])
      .filter((i) => !i.deleted_at)
      .map((i) => plotItemDates(i, board)?.start)
      .filter((d): d is Date => !!d)
      .reduce<Date | null>((a, b) => (!a || b < a ? b : a), null);

    // Each task's own days only: a delay pushed down a chain is lost once,
    // by the task it started on, not again by every task after it.
    const daysLost = review.late.reduce((sum, t) => sum + Math.max(0, t.own), 0);
    const reasonDays = new Map(review.lostByReason.map((r) => [r.category, r.days]));
    projects.push({
      board,
      workspace: board.workspace_id ? workspaceById.get(board.workspace_id) ?? null : null,
      review,
      plannedDays: plannedStart ? inclusiveDays(plannedStart, review.plannedFinish!) : 0,
      actualDays: start ? inclusiveDays(start, review.finish!) : 0,
      daysLost,
      explainedPct:
        daysLost > 0 ? Math.round(((daysLost - review.unexplainedTotal) / daysLost) * 100) : null,
      topReason: topOf(reasonDays),
    });
  }

  const projectName = (p: LessonProject) => p.workspace?.name ?? p.board.name;

  // ---- days lost by reason, across projects
  const lost = new Map<DelayCategory, { days: number; byProject: { name: string; days: number }[] }>();
  for (const project of projects) {
    for (const row of project.review.lostByReason) {
      const entry = lost.get(row.category) ?? { days: 0, byProject: [] };
      entry.days += row.days;
      entry.byProject.push({ name: projectName(project), days: row.days });
      lost.set(row.category, entry);
    }
  }
  const lostByReason = Array.from(lost, ([category, v]) => ({ category, ...v })).sort(
    (a, b) => b.days - a.days || DELAY_CATEGORIES.indexOf(a.category) - DELAY_CATEGORIES.indexOf(b.category)
  );

  // ---- task types, across projects
  const byType = new Map<string, { names: Map<string, number>; runs: TaskTypeRun[] }>();
  for (const project of projects) {
    const boardItems = (itemsByBoard.get(project.board.id) ?? []).filter((i) => !i.deleted_at);
    const boardNotes = notesByBoard.get(project.board.id) ?? [];
    for (const item of boardItems) {
      const baseStart = parseDateOnly(item.baseline?.start);
      const baseEnd = parseDateOnly(item.baseline?.end);
      const plotted = plotItemDates(item, project.board);
      if (!baseStart || !baseEnd || !plotted) continue;
      const key = taskTypeKey(item.name);
      if (!key) continue;
      const entry = byType.get(key) ?? { names: new Map<string, number>(), runs: [] };
      entry.names.set(item.name.trim(), (entry.names.get(item.name.trim()) ?? 0) + 1);
      entry.runs.push({
        project,
        item,
        plannedDays: inclusiveDays(baseStart, baseEnd),
        actualDays: inclusiveDays(plotted.start, plotted.end),
        notes: boardNotes.filter((n) => n.item_id === item.id),
      });
      byType.set(key, entry);
    }
  }

  const taskTypes: TaskType[] = [];
  for (const [key, { names, runs }] of byType) {
    const projectCount = new Set(runs.map((r) => r.project.board.id)).size;
    if (projectCount < TABLE_MIN_PROJECTS) continue;
    const plannedAvg = runs.reduce((s, r) => s + r.plannedDays, 0) / runs.length;
    const actualAvg = runs.reduce((s, r) => s + r.actualDays, 0) / runs.length;
    const reasonDays = new Map<DelayCategory, number>();
    for (const run of runs) {
      for (const note of run.notes) {
        if (note.days > 0) reasonDays.set(note.category, (reasonDays.get(note.category) ?? 0) + note.days);
      }
    }
    // The spelling used most; on a tie, the one written like a name - a
    // capital first, not all capitals - over "plomberie" or "PLOMBERIE".
    const natural = (n: string) =>
      n[0] === n[0].toUpperCase() && n !== n.toUpperCase() ? 1 : 0;
    const name = Array.from(names).sort(
      (a, b) => b[1] - a[1] || natural(b[0]) - natural(a[0]) || a[0].localeCompare(b[0])
    )[0][0];
    taskTypes.push({
      key,
      name,
      runs,
      projectCount,
      plannedAvg,
      actualAvg,
      overrunAvg: actualAvg - plannedAvg,
      lateRuns: runs.filter((r) => r.actualDays > r.plannedDays).length,
      topReason: topOf(reasonDays),
    });
  }
  const running = taskTypes
    .filter((type) => type.overrunAvg > 0)
    .sort((a, b) => b.overrunAvg - a.overrunAvg || b.projectCount - a.projectCount);

  const lateTaskCount = projects.reduce(
    (s, p) => s + p.review.late.filter((t) => t.own > 0).length,
    0
  );
  const daysLost = projects.reduce((s, p) => s + p.daysLost, 0);
  const unexplainedTotal = projects.reduce((s, p) => s + p.review.unexplainedTotal, 0);

  return {
    projects: projects.sort((a, b) => b.review.finishSlip - a.review.finishSlip),
    onTimeCount: projects.filter((p) => p.review.finishSlip <= 0).length,
    finishSlipAvg: projects.length
      ? projects.reduce((s, p) => s + p.review.finishSlip, 0) / projects.length
      : null,
    daysLost,
    lateTaskCount,
    explainedDays: daysLost - unexplainedTotal,
    lostByReason,
    unexplainedTotal,
    taskTypes: running.slice(0, TABLE_LIMIT),
    typeIndex: new Map(taskTypes.map((type) => [type.key, type])),
    advice: running
      .filter((type) => type.projectCount >= ADVICE_MIN_PROJECTS && type.overrunAvg >= ADVICE_MIN_OVERRUN)
      .sort((a, b) => b.overrunAvg * b.projectCount - a.overrunAvg * a.projectCount)
      .slice(0, ADVICE_LIMIT),
  };
}

/**
 * What past projects say about a task being planned now, or null when they
 * say nothing worth interrupting for: too little history, no habit of running
 * over, or a length already as long as it usually takes.
 */
export function planningHintFor(
  name: string,
  plannedDays: number,
  types: Map<string, TaskType>
): { type: TaskType; suggestedDays: number } | null {
  const type = types.get(taskTypeKey(name));
  if (!type) return null;
  if (type.projectCount < ADVICE_MIN_PROJECTS || type.overrunAvg < ADVICE_MIN_OVERRUN) return null;
  const suggestedDays = Math.round(type.actualAvg);
  if (plannedDays >= suggestedDays) return null;
  return { type, suggestedDays };
}
