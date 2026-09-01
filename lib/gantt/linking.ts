/**
 * Creating and editing dependencies on the chart itself.
 *
 * Links could only be made in a cell editor, one id at a time, and they were
 * always plain finish-to-start with no lag — so the four link types and the lag
 * the scheduler understands had no way to be entered at all.
 *
 * Dragging between two bars says everything needed: **which edge you leave and
 * which edge you land on is the link type**. Out of a finish into a start is
 * finish-to-start; out of a start into a start is start-to-start; and so on.
 * There is nothing extra to choose, which is why every planning tool does it
 * this way.
 */

import type { DependencyType } from "@/types";
import type { GanttDependency } from "./dependencies";

/** Which end of a bar a drag started from or landed on. */
export type BarEdge = "start" | "finish";

export function inferDependencyType(from: BarEdge, to: BarEdge): DependencyType {
  if (from === "finish") return to === "start" ? "FS" : "FF";
  return to === "start" ? "SS" : "SF";
}

/** The edges a link type joins - used to draw an existing arrow back to its handles. */
export function edgesOfType(type: DependencyType): { from: BarEdge; to: BarEdge } {
  switch (type) {
    case "FS":
      return { from: "finish", to: "start" };
    case "FF":
      return { from: "finish", to: "finish" };
    case "SS":
      return { from: "start", to: "start" };
    case "SF":
      return { from: "start", to: "finish" };
  }
}

export type LinkRejection =
  | "self"
  | "duplicate"
  | "reverse-duplicate"
  | "cycle";

export interface LinkValidation {
  ok: boolean;
  reason?: LinkRejection;
  message?: string;
}

const OK: LinkValidation = { ok: true };

/**
 * Whether a proposed link can be made.
 *
 * The cycle check is the one that matters: a loop is not merely untidy, it is a
 * plan with no order. The scheduler reports one rather than hanging, and the
 * rescheduler stops pushing, but neither can say what the dates should be — so
 * it is far better never to let one be drawn.
 */
export function validateNewLink(
  dependencies: GanttDependency[],
  sourceId: string,
  targetId: string
): LinkValidation {
  if (sourceId === targetId) {
    return { ok: false, reason: "self", message: "A task cannot depend on itself." };
  }

  for (const dependency of dependencies) {
    if (dependency.sourceId === sourceId && dependency.targetId === targetId) {
      return {
        ok: false,
        reason: "duplicate",
        message: "These tasks are already linked.",
      };
    }
    if (dependency.sourceId === targetId && dependency.targetId === sourceId) {
      return {
        ok: false,
        reason: "reverse-duplicate",
        message: "These tasks are already linked the other way round.",
      };
    }
  }

  if (wouldCreateCycle(dependencies, sourceId, targetId)) {
    return {
      ok: false,
      reason: "cycle",
      message: "That would make these tasks depend on each other in a loop.",
    };
  }

  return OK;
}

/**
 * Would adding source → target close a loop?
 *
 * True when the target can already reach the source, since the new edge would
 * then complete the circle. Iterative rather than recursive: a deep chain is
 * ordinary in a real plan and should not depend on stack depth.
 */
export function wouldCreateCycle(
  dependencies: GanttDependency[],
  sourceId: string,
  targetId: string
): boolean {
  if (sourceId === targetId) return true;

  const successors = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const list = successors.get(dependency.sourceId);
    if (list) list.push(dependency.targetId);
    else successors.set(dependency.sourceId, [dependency.targetId]);
  }

  const seen = new Set<string>([targetId]);
  const stack = [targetId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === sourceId) return true;
    for (const next of successors.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }

  return false;
}

/** A lag a user typed, held to something a schedule can mean. */
export function clampLag(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-365, Math.min(365, Math.trunc(value)));
}

export function describeDependency(type: DependencyType, lag: number): string {
  const names: Record<DependencyType, string> = {
    FS: "Finish → Start",
    SS: "Start → Start",
    FF: "Finish → Finish",
    SF: "Start → Finish",
  };
  if (lag === 0) return names[type];
  return lag > 0
    ? `${names[type]}, ${lag}d later`
    : `${names[type]}, ${-lag}d overlap`;
}
