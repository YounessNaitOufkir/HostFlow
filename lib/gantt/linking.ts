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
import type { TranslateVars, TranslationKey } from "@/lib/i18n";
import type { GanttDependency } from "./dependencies";

/** Which end of a bar a drag started from or landed on. */
export type BarEdge = "start" | "finish";

/**
 * The types a link may be given.
 *
 * Start-to-finish is gone from the list: it says "this cannot finish until that
 * starts", which describes a shift handover rather than anything on a building
 * site, and in practice it was only ever produced by a mis-drag. It stays in
 * DependencyType because links already carrying it must keep meaning what they
 * meant - they render, and the editor still shows the type so it can be
 * changed. Only creating a new one is refused.
 */
export const SELECTABLE_DEPENDENCY_TYPES: DependencyType[] = ["FS", "SS", "FF"];

/**
 * The type a drag implies, or null when the pair of edges no longer names one.
 *
 * Null rather than a nearest guess: dragging start-to-finish is a deliberate
 * gesture, and quietly turning it into a different rule would be worse than
 * saying it is not available.
 */
export function inferDependencyType(from: BarEdge, to: BarEdge): DependencyType | null {
  if (from === "finish") return to === "start" ? "FS" : "FF";
  return to === "start" ? "SS" : null;
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
  /** A key rather than a sentence: this module has no locale. */
  messageKey?: TranslationKey;
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
    return { ok: false, reason: "self", messageKey: "gantt.linkSelf" };
  }

  for (const dependency of dependencies) {
    if (dependency.sourceId === sourceId && dependency.targetId === targetId) {
      return { ok: false, reason: "duplicate", messageKey: "gantt.linkDuplicate" };
    }
    if (dependency.sourceId === targetId && dependency.targetId === sourceId) {
      return {
        ok: false,
        reason: "reverse-duplicate",
        messageKey: "gantt.linkReverse",
      };
    }
  }

  if (wouldCreateCycle(dependencies, sourceId, targetId)) {
    return { ok: false, reason: "cycle", messageKey: "gantt.linkCycle" };
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

const TYPE_KEYS: Record<DependencyType, TranslationKey> = {
  FS: "gantt.dep.FS",
  SS: "gantt.dep.SS",
  FF: "gantt.dep.FF",
  SF: "gantt.dep.SF",
};

export function dependencyTypeKey(type: DependencyType): TranslationKey {
  return TYPE_KEYS[type];
}

/** Reads a link aloud: "Finish → Start, 3d later". */
export function describeDependency(
  t: (key: TranslationKey, vars?: TranslateVars) => string,
  type: DependencyType,
  lag: number
): string {
  const name = t(TYPE_KEYS[type]);
  if (lag === 0) return name;
  return lag > 0
    ? t("gantt.depLater", { name, days: lag })
    : t("gantt.depOverlap", { name, days: -lag });
}
