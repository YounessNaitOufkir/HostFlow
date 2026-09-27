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
 * Everything is integer day offsets from a fixed epoch. Working days are
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
  /**
   * The project this task belongs to - its board. Tasks sharing a scope share a
   * finish date. Omitted, every task is one project.
   */
  scopeId?: string;
  /**
   * Finished. Its dates are what happened, so it still holds back what waits
   * on it, but it can no longer slip: it is never critical, and it does not
   * set its project's finish date.
   */
  done?: boolean;
  /**
   * The earliest it can now finish, when that is later than its entered end:
   * an unfinished task whose end has passed finishes today at the soonest.
   * Only the passes see this; broken links are still judged on entered dates.
   */
  finishNoEarlierThan?: number;
  /**
   * The date its project has to be finished by. A scope is measured against
   * the earlier of its own finish and the earliest target among its tasks, so
   * a plan running past its target shows as negative float - how many days
   * each task on the offending chain is late.
   */
  targetFinish?: number;
}

/**
 * What a critical path is measured against.
 *
 *  - "project": each board finishes when its last task does, and its chain is
 *    the one that sets that date. Boards joined by a dependency are one
 *    project, since a slip in one really does move the other. This is what
 *    keeps the Master Gantt from crowning a single apartment's chain and
 *    reporting every other apartment as slack against a date not its own.
 *  - "chain": every set of linked tasks is its own path, finishing when its
 *    own last task does (MS Project's "multiple critical paths"). A task with
 *    no links belongs to no chain and is never critical.
 */
export type CriticalPathScope = "project" | "chain";
export const CRITICAL_PATH_SCOPES: CriticalPathScope[] = ["project", "chain"];

export interface ScheduleOptions {
  scope?: CriticalPathScope;
  /**
   * Slack, in days, at or below which a task counts as critical. Zero is the
   * textbook path; a day or two more flags the near-critical chains too, the
   * ones one bad day away from setting the finish (MS Project's "tasks are
   * critical if slack is less than or equal to").
   */
  criticalThreshold?: number;
}

/** The thresholds offered, in days. */
export const CRITICAL_THRESHOLDS = [0, 1, 2, 3, 5] as const;


export interface TaskSchedule {
  id: string;
  duration: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  /**
   * Days this task could slip before the project's finish moves. Negative when
   * the project runs past its target: the days it is already late by.
   */
  totalFloat: number;
  /**
   * Days it could slip before it delays any task waiting on it - as opposed
   * to the finish. Never negative and never more than `totalFloat`; a task
   * with nothing after it has its total float here.
   */
  freeFloat: number;
  isCritical: boolean;
  /** Part of a dependency loop: the passes cannot order it, so it has no float. */
  inCycle: boolean;
  /**
   * Chain scope only: linked to nothing, so it belongs to no path and its
   * float means nothing. Always false in project scope.
   */
  unlinked: boolean;
  /** Finished, so it has no float to speak of and is never critical. */
  done: boolean;
  /** Overdue and unfinished: the passes counted it as finishing on `earlyFinish`, past its entered end. */
  late: boolean;
}

export interface DependencyViolation {
  dependencyId: string;
  sourceId: string;
  targetId: string;
  type: DependencyType;
  lag: number;
  /** Days by which the entered dates break the link. Always positive. */
  overlapDays: number;
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
  dependencies: GanttDependency[],
  options: ScheduleOptions = {}
): ScheduleResult {
  const scope = options.scope ?? "project";
  const threshold = Math.max(0, options.criticalThreshold ?? 0);
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
  /** Days a task occupies in the passes - longer than entered when it runs late. */
  const span = new Map<string, number>();

  for (const id of order) {
    const task = byId.get(id)!;
    const length = duration(id);
    let es = task.start;

    for (const edge of predecessors.get(id) ?? []) {
      if (cycleIds.has(edge.sourceId)) continue;
      const pEs = earlyStart.get(edge.sourceId);
      const pEf = earlyFinish.get(edge.sourceId);
      if (pEs === undefined || pEf === undefined) continue;
      let required: number;
      switch (edge.type) {
        case "FS":
          required = pEf + 1 + edge.lag;
          break;
        case "SS":
          required = pEs + edge.lag;
          break;
        case "FF":
          // Its finish is constrained, so its start follows from its own length.
          required = pEf + edge.lag - length + 1;
          break;
      }
      es = Math.max(es, required);
    }

    let ef = es + length - 1;
    // Overdue and unfinished: it cannot finish before today, however early
    // its dates say. The start stays, so it reads as work running long.
    if (!task.done && task.finishNoEarlierThan !== undefined && task.finishNoEarlierThan > ef) {
      ef = task.finishNoEarlierThan;
    }

    earlyStart.set(id, es);
    earlyFinish.set(id, ef);
    span.set(id, ef - es + 1);
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

  // ---- scopes: which tasks share a finish date.
  const { componentOf, linkedIds } = partition(tasks, edges, scope);
  // Only unfinished work sets a finish date: a done task whose end was left in
  // the future would otherwise hand everything else slack against a date that
  // no longer means anything. A scope with nothing left falls back to its
  // finished tasks, where the number no longer matters.
  const componentFinish = new Map<string, number>();
  const widen = (task: ScheduleTaskInput) => {
    const component = componentOf.get(task.id)!;
    const ef = earlyFinish.get(task.id) ?? task.end;
    const current = componentFinish.get(component);
    if (current === undefined || ef > current) componentFinish.set(component, ef);
  };
  for (const task of tasks) if (!task.done) widen(task);
  for (const task of tasks) {
    if (task.done && !componentFinish.has(componentOf.get(task.id)!)) widen(task);
  }
  // A target only ever pulls the finish earlier: one later than the plan's own
  // finish leaves the plan's float as it is, as MS Project treats a deadline.
  for (const task of tasks) {
    if (task.targetFinish === undefined) continue;
    const component = componentOf.get(task.id)!;
    const current = componentFinish.get(component)!;
    if (task.targetFinish < current) componentFinish.set(component, task.targetFinish);
  }

  // ---- backward pass: the latest each task can sit without moving the finish.
  const lateFinish = new Map<string, number>();
  const lateStart = new Map<string, number>();

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const length = span.get(id) ?? duration(id);
    let lf = componentFinish.get(componentOf.get(id)!)!;

    for (const edge of successors.get(id) ?? []) {
      if (cycleIds.has(edge.targetId)) continue;
      // A finished successor cannot be pushed, so it leaves no deadline behind it.
      if (byId.get(edge.targetId)!.done) continue;
      const sLs = lateStart.get(edge.targetId);
      const sLf = lateFinish.get(edge.targetId);
      if (sLs === undefined || sLf === undefined) continue;
      let allowed: number;
      switch (edge.type) {
        case "FS":
          allowed = sLs - 1 - edge.lag;
          break;
        case "SS":
          // Its start is what is constrained; its finish follows from its length.
          allowed = sLs - edge.lag + length - 1;
          break;
        case "FF":
          allowed = sLf - edge.lag;
          break;
      }
      lf = Math.min(lf, allowed);
    }

    lateFinish.set(id, lf);
    lateStart.set(id, lf - length + 1);
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
    const unlinked = scope === "chain" && !linkedIds.has(task.id);
    const done = !!task.done;
    const late =
      !done && !inCycle && task.finishNoEarlierThan !== undefined && task.finishNoEarlierThan > task.end;
    const totalFloat = inCycle ? 0 : lf - ef;
    const isCritical = !inCycle && !unlinked && !done && totalFloat <= threshold;

    // Free float: the gap to the nearest thing waiting on it, measured on the
    // forward pass. Capped by total float, since slipping past that moves the
    // finish whatever the next task does.
    let freeFloat = totalFloat;
    if (!inCycle) {
      for (const edge of successors.get(task.id) ?? []) {
        if (cycleIds.has(edge.targetId) || byId.get(edge.targetId)!.done) continue;
        const sEs = earlyStart.get(edge.targetId)!;
        const sEf = earlyFinish.get(edge.targetId)!;
        const gap =
          edge.type === "FS"
            ? sEs - (ef + 1 + edge.lag)
            : edge.type === "SS"
              ? sEs - (es + edge.lag)
              : sEf - (ef + edge.lag);
        freeFloat = Math.min(freeFloat, gap);
      }
    }
    freeFloat = Math.max(0, freeFloat);

    if (isCritical) criticalIds.add(task.id);

    result.set(task.id, {
      id: task.id,
      duration: duration(task.id),
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat,
      freeFloat,
      isCritical,
      inCycle,
      unlinked,
      done,
      late,
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

    switch (edge.type) {
      case "FS":
        required = source.end + 1 + edge.lag;
        actual = target.start;
        break;
      case "SS":
        required = source.start + edge.lag;
        actual = target.start;
        break;
      case "FF":
        required = source.end + edge.lag;
        actual = target.end;
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
      });
    }
  }

  return violations;
}

/**
 * Groups tasks that share a finish date, with a union-find.
 *
 * Every link joins its two ends, in both scopes. Project scope also joins all
 * tasks of one board, so a board is one project unless a cross-board link
 * merges it with another. Chain scope joins by links alone.
 */
function partition(
  tasks: ScheduleTaskInput[],
  edges: GanttDependency[],
  scope: CriticalPathScope
): { componentOf: Map<string, string>; linkedIds: Set<string> } {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression, iteratively: a 2,000-task chain must not recurse.
    let node = id;
    while (node !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const task of tasks) parent.set(task.id, task.id);

  const linkedIds = new Set<string>();
  for (const edge of edges) {
    linkedIds.add(edge.sourceId);
    linkedIds.add(edge.targetId);
    union(edge.sourceId, edge.targetId);
  }

  if (scope === "project") {
    const firstOfScope = new Map<string, string>();
    for (const task of tasks) {
      const key = task.scopeId ?? "";
      const first = firstOfScope.get(key);
      if (first === undefined) firstOfScope.set(key, task.id);
      else union(first, task.id);
    }
  }

  const componentOf = new Map<string, string>();
  for (const task of tasks) componentOf.set(task.id, find(task.id));
  return { componentOf, linkedIds };
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
