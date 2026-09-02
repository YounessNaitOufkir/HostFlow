/**
 * Moving a task and taking its successors with it.
 *
 * Dragging a bar used to move only that bar. A plan where the arrows do not
 * mean anything is a picture of a plan, so a task could be pushed a month later
 * and everything that depended on it would sit exactly where it was, the arrows
 * quietly pointing backwards.
 *
 * The rule here is **push, never pull**. A successor moves only as far as it
 * must to keep its link intact, and only ever later:
 *
 *  - Dates in this product are typed in by people, not derived from durations.
 *    Pulling a task earlier because its predecessor moved would overwrite a
 *    date somebody chose, which is not a drag's business.
 *  - Slack is absorbed rather than preserved. A successor sitting three days
 *    after the link required it stays put when its predecessor moves two days
 *    later, and moves one day when it moves four. That is what people mean when
 *    they say a task "has three days of slack".
 *
 * Durations are preserved exactly: a task is moved, never stretched.
 */

import type { DependencyType } from "@/types";
import type { GanttDependency } from "./dependencies";

export interface RescheduleTask {
  /** Day offsets from a common epoch, inclusive of both ends. */
  start: number;
  end: number;
}

export interface RescheduleInput {
  tasks: Map<string, RescheduleTask>;
  dependencies: GanttDependency[];
  /** The task the user dragged or resized. */
  movedId: string;
  /** Where they put it. */
  movedTo: RescheduleTask;
}

export interface RescheduleResult {
  /** Every task whose dates changed, the dragged one included. */
  moves: Map<string, RescheduleTask>;
  /** True when a dependency loop stopped the walk before it settled. */
  cycleDetected: boolean;
}

export function rescheduleFrom({
  tasks,
  dependencies,
  movedId,
  movedTo,
}: RescheduleInput): RescheduleResult {
  const moves = new Map<string, RescheduleTask>();
  const original = tasks.get(movedId);
  if (!original) return { moves, cycleDetected: false };

  // Nothing to do if the drag ended where it started.
  if (original.start === movedTo.start && original.end === movedTo.end) {
    return { moves, cycleDetected: false };
  }

  moves.set(movedId, movedTo);

  const successors = new Map<string, GanttDependency[]>();
  for (const dependency of dependencies) {
    if (!tasks.has(dependency.sourceId) || !tasks.has(dependency.targetId)) continue;
    const list = successors.get(dependency.sourceId);
    if (list) list.push(dependency);
    else successors.set(dependency.sourceId, [dependency]);
  }

  const positionOf = (id: string) => moves.get(id) ?? tasks.get(id)!;

  let cycleDetected = false;
  // Each task may be re-examined when a second predecessor pushes it further,
  // so this counts visits rather than marking nodes done. The ceiling is what
  // stops a dependency loop from spinning: a settled plan cannot need more
  // passes than it has edges.
  const budget = Math.max(64, dependencies.length * dependencies.length + tasks.size);
  let steps = 0;

  const queue: string[] = [movedId];

  while (queue.length > 0) {
    if (steps++ > budget) {
      cycleDetected = true;
      break;
    }

    const currentId = queue.shift()!;
    const current = positionOf(currentId);

    for (const dependency of successors.get(currentId) ?? []) {
      const target = positionOf(dependency.targetId);
      const duration = target.end - target.start;

      const earliestStart = requiredStart(
        dependency.type,
        current.start,
        current.end,
        dependency.lag,
        duration
      );

      // Push only. A successor already late enough is left alone, which is how
      // its slack gets absorbed instead of dragged along.
      if (earliestStart <= target.start) continue;

      moves.set(dependency.targetId, {
        start: earliestStart,
        end: earliestStart + duration,
      });
      queue.push(dependency.targetId);
    }
  }

  return { moves, cycleDetected };
}

/**
 * The earliest a successor may start under each link type.
 *
 * `duration` is the span in days minus one, matching how the task's own
 * `end - start` is measured, so a one-day task has a duration of zero here.
 */
function requiredStart(
  type: DependencyType,
  predStart: number,
  predEnd: number,
  lag: number,
  duration: number
): number {
  switch (type) {
    case "FS":
      return predEnd + 1 + lag;
    case "SS":
      return predStart + lag;
    case "FF":
      // Its finish is pinned, so its start follows from its own length.
      return predEnd + lag - duration;
  }
}
