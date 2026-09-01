/**
 * Critical path analysis over the plan as entered.
 *
 * Standard CPM computes dates from durations. Here the dates are the user's
 * own facts, so the passes below treat each task's entered start as an
 * earliest-possible constraint and its entered length as its duration, then ask
 * the only question a Gantt can usefully answer about a plan someone typed in:
 * **which tasks have no room to slip**.
 *
 * A task's total float is how many days it could move without pushing the
 * project's finish. Zero float means the finish date moves the day that task
 * does - that chain is the critical path, and it is the thing a Gantt exists to
 * make visible. Without it every bar looks equally important.
 *
 * Everything is integer day offsets from an arbitrary epoch. Working days are
 * deliberately not modelled: this plan's durations are calendar days, and
 * pretending otherwise would report float the dates do not support.
 */

import type { DependencyType } from "@/types";
import type { GanttDependency } from "./dependencies";

export interface ScheduleTaskInput {
  id: string;
  /** Day offsets from a common epoch, inclusive of both ends. */
  start: number;
  end: number;
}

export interface TaskSchedule {
  id: string;
  duration: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  /** Days this task could slip before the project's finish moves. */
  totalFloat: number;
  isCritical: boolean;
  /** Part of a dependency loop: the passes cannot order it, so it has no float. */
  inCycle: boolean;
}

export interface DependencyViolation {
  dependencyId: string;
  sourceId: string;
  targetId: string;
  type: DependencyType;
  lag: number;
  /** Days by which the entered dates break the link. Always positive. */
  overlapDays: number;
  message: string;
}

export interface ScheduleResult {
  tasks: Map<string, TaskSchedule>;
  violations: DependencyViolation[];
  /** Tasks caught in a dependency loop, which is a plan that cannot be scheduled. */
  cycleIds: Set<string>;
  criticalIds: Set<string>;
  /** Dependencies joining two critical tasks - the arrows to draw as the path. */
  criticalDependencyIds: Set<string>;
  projectStart: number;
  projectFinish: number;
}

const EMPTY: ScheduleResult = {
  tasks: new Map(),
  violations: [],
  cycleIds: new Set(),
  criticalIds: new Set(),
  criticalDependencyIds: new Set(),
  projectStart: 0,
  projectFinish: 0,
};

export function computeSchedule(
  tasks: ScheduleTaskInput[],
  dependencies: GanttDependency[]
): ScheduleResult {
  if (tasks.length === 0) return EMPTY;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const edges = dependencies.filter(
    (d) => byId.has(d.sourceId) && byId.has(d.targetId)
  );

  // Inclusive, so a same-day task - a milestone included - lasts one day.
  const duration = (id: string) => {
    const t = byId.get(id)!;
    return Math.max(1, t.end - t.start + 1);
  };

  const successors = new Map<string, GanttDependency[]>();
  const predecessors = new Map<string, GanttDependency[]>();
  for (const edge of edges) {
    const outgoing = successors.get(edge.sourceId);
    if (outgoing) outgoing.push(edge);
    else successors.set(edge.sourceId, [edge]);

    const incoming = predecessors.get(edge.targetId);
    if (incoming) incoming.push(edge);
    else predecessors.set(edge.targetId, [edge]);
  }

  const { order, cycleIds } = topologicalOrder(tasks, edges, predecessors);

  // ---- forward pass: the earliest each task can sit, given its own start date
  //      as a floor and every predecessor's constraint.
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  for (const id of order) {
    const task = byId.get(id)!;
    let es = task.start;

    for (const edge of predecessors.get(id) ?? []) {
      if (cycleIds.has(edge.sourceId)) continue;
      const pEs = earlyStart.get(edge.sourceId);
      const pEf = earlyFinish.get(edge.sourceId);
      if (pEs === undefined || pEf === undefined) continue;
      es = Math.max(es, requiredStart(edge.type, pEs, pEf, edge.lag, duration(id)));
    }

    earlyStart.set(id, es);
    earlyFinish.set(id, es + duration(id) - 1);
  }

  // A task in a cycle cannot be ordered; anchor it on its own dates so the rest
  // of the plan still schedules around it.
  for (const id of cycleIds) {
    const task = byId.get(id)!;
    earlyStart.set(id, task.start);
    earlyFinish.set(id, task.end);
  }

  const projectStart = Math.min(...tasks.map((t) => earlyStart.get(t.id) ?? t.start));
  const projectFinish = Math.max(...tasks.map((t) => earlyFinish.get(t.id) ?? t.end));

  // ---- backward pass: the latest each task can sit without moving the finish.
  const lateFinish = new Map<string, number>();
  const lateStart = new Map<string, number>();

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const dur = duration(id);
    let lf = projectFinish;

    for (const edge of successors.get(id) ?? []) {
      if (cycleIds.has(edge.targetId)) continue;
      const sLs = lateStart.get(edge.targetId);
      const sLf = lateFinish.get(edge.targetId);
      if (sLs === undefined || sLf === undefined) continue;
      lf = Math.min(lf, allowedFinish(edge.type, sLs, sLf, edge.lag, dur));
    }

    lateFinish.set(id, lf);
    lateStart.set(id, lf - dur + 1);
  }

  for (const id of cycleIds) {
    const task = byId.get(id)!;
    lateFinish.set(id, task.end);
    lateStart.set(id, task.start);
  }

  // ---- results
  const result = new Map<string, TaskSchedule>();
  const criticalIds = new Set<string>();

  for (const task of tasks) {
    const es = earlyStart.get(task.id) ?? task.start;
    const ef = earlyFinish.get(task.id) ?? task.end;
    const ls = lateStart.get(task.id) ?? task.start;
    const lf = lateFinish.get(task.id) ?? task.end;
    const inCycle = cycleIds.has(task.id);
    const totalFloat = inCycle ? 0 : ls - es;
    const isCritical = !inCycle && totalFloat <= 0;

    if (isCritical) criticalIds.add(task.id);

    result.set(task.id, {
      id: task.id,
      duration: duration(task.id),
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat,
      isCritical,
      inCycle,
    });
  }

  const criticalDependencyIds = new Set(
    edges
      .filter((e) => criticalIds.has(e.sourceId) && criticalIds.has(e.targetId))
      .map((e) => e.id)
  );

  return {
    tasks: result,
    violations: findViolations(edges, byId),
    cycleIds,
    criticalIds,
    criticalDependencyIds,
    projectStart,
    projectFinish,
  };
}

/** The earliest a successor may start, given where its predecessor actually lands. */
function requiredStart(
  type: DependencyType,
  predStart: number,
  predFinish: number,
  lag: number,
  ownDuration: number
): number {
  switch (type) {
    case "FS":
      return predFinish + 1 + lag;
    case "SS":
      return predStart + lag;
    case "FF":
      // Its finish is constrained, so its start follows from its own length.
      return predFinish + lag - ownDuration + 1;
    case "SF":
      return predStart + lag - ownDuration + 1;
  }
}

/** The latest a predecessor may finish, given where its successor must land. */
function allowedFinish(
  type: DependencyType,
  succLateStart: number,
  succLateFinish: number,
  lag: number,
  ownDuration: number
): number {
  const span = ownDuration - 1;
  switch (type) {
    case "FS":
      return succLateStart - 1 - lag;
    case "SS":
      return succLateStart - lag + span;
    case "FF":
      return succLateFinish - lag;
    case "SF":
      return succLateFinish - lag + span;
  }
}

/**
 * Links the entered dates already break.
 *
 * The old chart drew these arrows exactly like any other, so a successor
 * starting before its predecessor finished looked identical to a plan that
 * worked — the arrow simply pointed backwards and nothing said why.
 */
function findViolations(
  edges: GanttDependency[],
  byId: Map<string, ScheduleTaskInput>
): DependencyViolation[] {
  const violations: DependencyViolation[] = [];

  for (const edge of edges) {
    const source = byId.get(edge.sourceId)!;
    const target = byId.get(edge.targetId)!;

    let required: number;
    let actual: number;
    let what: string;

    switch (edge.type) {
      case "FS":
        required = source.end + 1 + edge.lag;
        actual = target.start;
        what = "start after";
        break;
      case "SS":
        required = source.start + edge.lag;
        actual = target.start;
        what = "start no earlier than";
        break;
      case "FF":
        required = source.end + edge.lag;
        actual = target.end;
        what = "finish no earlier than";
        break;
      case "SF":
        required = source.start + edge.lag;
        actual = target.end;
        what = "finish no earlier than";
        break;
    }

    if (actual < required) {
      const overlapDays = required - actual;
      violations.push({
        dependencyId: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        type: edge.type,
        lag: edge.lag,
        overlapDays,
        message: `This task should ${what} its predecessor by ${describeLag(edge.lag)}, but it is ${overlapDays} day${overlapDays === 1 ? "" : "s"} too early.`,
      });
    }
  }

  return violations;
}

function describeLag(lag: number): string {
  if (lag === 0) return "0 days";
  if (lag > 0) return `${lag} day${lag === 1 ? "" : "s"}`;
  return `${-lag} day${lag === -1 ? "" : "s"} of overlap`;
}

/**
 * Kahn's algorithm. Whatever it cannot place is in a cycle - and a plan with a
 * dependency loop has no critical path, so the loop is reported rather than
 * silently producing numbers that mean nothing.
 */
function topologicalOrder(
  tasks: ScheduleTaskInput[],
  edges: GanttDependency[],
  predecessors: Map<string, GanttDependency[]>
): { order: string[]; cycleIds: Set<string> } {
  const indegree = new Map<string, number>();
  for (const task of tasks) {
    indegree.set(task.id, (predecessors.get(task.id) ?? []).length);
  }

  const successors = new Map<string, string[]>();
  for (const edge of edges) {
    const list = successors.get(edge.sourceId);
    if (list) list.push(edge.targetId);
    else successors.set(edge.sourceId, [edge.targetId]);
  }

  const queue = tasks.filter((t) => indegree.get(t.id) === 0).map((t) => t.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of successors.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  const placed = new Set(order);
  const cycleIds = new Set(tasks.map((t) => t.id).filter((id) => !placed.has(id)));

  return { order, cycleIds };
}
