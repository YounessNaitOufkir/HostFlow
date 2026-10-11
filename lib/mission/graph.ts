import type { GanttDependency } from "@/lib/gantt/dependencies";

/**
 * How much of the plan each task holds up: the number of distinct OPEN tasks
 * reachable downstream of it, however many links away.
 *
 * Done tasks are walked through but not counted - finishing the plumbing still
 * unblocks the painting behind the already-signed-off inspection. The walk keeps
 * a visited set, so a cycle (two tasks waiting on each other, which the board
 * does not forbid) terminates, and a task never counts itself.
 *
 * Every id that appears in `deps` gets an entry; anything else is 0.
 */
export function openSuccessorCounts(
  deps: GanttDependency[],
  isOpen: (itemId: string) => boolean
): Map<string, number> {
  const next = new Map<string, string[]>();
  const ids = new Set<string>();
  for (const dep of deps) {
    ids.add(dep.sourceId);
    ids.add(dep.targetId);
    const list = next.get(dep.sourceId);
    if (list) list.push(dep.targetId);
    else next.set(dep.sourceId, [dep.targetId]);
  }

  const counts = new Map<string, number>();
  for (const start of ids) {
    const seen = new Set<string>([start]);
    const stack = [...(next.get(start) ?? [])];
    let count = 0;
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (isOpen(id)) count++;
      for (const n of next.get(id) ?? []) if (!seen.has(n)) stack.push(n);
    }
    counts.set(start, count);
  }
  return counts;
}
