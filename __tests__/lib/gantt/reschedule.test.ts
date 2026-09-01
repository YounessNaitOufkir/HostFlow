import { describe, it, expect } from "vitest";
import { rescheduleFrom, type RescheduleTask } from "@/lib/gantt/reschedule";
import type { GanttDependency } from "@/lib/gantt/dependencies";
import type { DependencyType } from "@/types";

/** A task occupying days [start, start + days - 1]. */
function at(start: number, days: number): RescheduleTask {
  return { start, end: start + days - 1 };
}

function dep(
  sourceId: string,
  targetId: string,
  type: DependencyType = "FS",
  lag = 0
): GanttDependency {
  return { id: `${sourceId}->${targetId}`, sourceId, targetId, type, lag };
}

function run(
  tasks: Record<string, RescheduleTask>,
  dependencies: GanttDependency[],
  movedId: string,
  movedTo: RescheduleTask
) {
  return rescheduleFrom({
    tasks: new Map(Object.entries(tasks)),
    dependencies,
    movedId,
    movedTo,
  });
}

describe("pushing successors", () => {
  it("moves a successor that would otherwise be left behind", () => {
    // A finishes day 4, B starts day 5. Drag A five days later and B has to follow.
    const { moves } = run(
      { A: at(0, 5), B: at(5, 3) },
      [dep("A", "B")],
      "A",
      at(5, 5)
    );
    expect(moves.get("A")).toEqual(at(5, 5));
    expect(moves.get("B")).toEqual(at(10, 3));
  });

  it("carries the push down a whole chain", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(5, 3), C: at(8, 2) },
      [dep("A", "B"), dep("B", "C")],
      "A",
      at(10, 5)
    );
    expect(moves.get("B")).toEqual(at(15, 3));
    expect(moves.get("C")).toEqual(at(18, 2));
  });

  it("never stretches a task", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(5, 7) },
      [dep("A", "B")],
      "A",
      at(20, 5)
    );
    const b = moves.get("B")!;
    expect(b.end - b.start).toBe(6);
  });

  it("absorbs slack instead of dragging it along", () => {
    // B sits three days after the link needs it to. A moves two days later, so
    // B still has room and must not move.
    const noMove = run(
      { A: at(0, 5), B: at(8, 3) },
      [dep("A", "B")],
      "A",
      at(2, 5)
    );
    expect(noMove.moves.has("B")).toBe(false);

    // Four days later and one day of the slack is gone.
    const partial = run(
      { A: at(0, 5), B: at(8, 3) },
      [dep("A", "B")],
      "A",
      at(4, 5)
    );
    expect(partial.moves.get("B")).toEqual(at(9, 3));
  });

  it("never pulls a task earlier", () => {
    // Dates here are typed in by people. Dragging a predecessor back must not
    // rewrite a successor's date that somebody deliberately chose.
    const { moves } = run(
      { A: at(10, 5), B: at(15, 3) },
      [dep("A", "B")],
      "A",
      at(0, 5)
    );
    expect(moves.get("A")).toEqual(at(0, 5));
    expect(moves.has("B")).toBe(false);
  });

  it("does nothing when the drag ends where it started", () => {
    const { moves } = run({ A: at(0, 5), B: at(5, 3) }, [dep("A", "B")], "A", at(0, 5));
    expect(moves.size).toBe(0);
  });

  it("pushes on a resize that extends past a successor", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(5, 3) },
      [dep("A", "B")],
      "A",
      at(0, 9)
    );
    expect(moves.get("B")).toEqual(at(9, 3));
  });

  it("takes the furthest of several predecessors", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(0, 20), C: at(21, 2) },
      [dep("A", "C"), dep("B", "C")],
      "A",
      at(30, 5)
    );
    // A now finishes on day 34, later than B's day 19.
    expect(moves.get("C")).toEqual(at(35, 2));
  });

  it("moves a task reached by two paths to the later of them, once", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(5, 2), C: at(5, 10), D: at(20, 3) },
      [dep("A", "B"), dep("A", "C"), dep("B", "D"), dep("C", "D")],
      "A",
      at(10, 5)
    );
    // A → C → D is the longer route: C runs 15–24, so D starts on 25.
    expect(moves.get("D")).toEqual(at(25, 3));
  });
});

describe("link types and lag", () => {
  it("honours a lag", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(5, 3) },
      [dep("A", "B", "FS", 3)],
      "A",
      at(5, 5)
    );
    // A finishes day 9, plus three days of curing, so B starts on 13.
    expect(moves.get("B")).toEqual(at(13, 3));
  });

  it("keeps a start-to-start pair together", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(0, 3) },
      [dep("A", "B", "SS")],
      "A",
      at(7, 5)
    );
    expect(moves.get("B")).toEqual(at(7, 3));
  });

  it("keeps a finish-to-finish pair landing together", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(2, 3) },
      [dep("A", "B", "FF")],
      "A",
      at(10, 5)
    );
    // A now finishes on day 14, so B's three days must end there too.
    expect(moves.get("B")).toEqual(at(12, 3));
  });

  it("handles start-to-finish", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(0, 4) },
      [dep("A", "B", "SF")],
      "A",
      at(20, 5)
    );
    expect(moves.get("B")!.end).toBe(20);
    expect(moves.get("B")).toEqual(at(17, 4));
  });

  it("allows an overlap with a negative lag", () => {
    const { moves } = run(
      { A: at(0, 10), B: at(10, 5) },
      [dep("A", "B", "FS", -4)],
      "A",
      at(10, 10)
    );
    // A finishes day 19; four days of overlap puts B at 16.
    expect(moves.get("B")).toEqual(at(16, 5));
  });
});

describe("robustness", () => {
  it("ignores links to tasks that are not on the chart", () => {
    const { moves } = run({ A: at(0, 5) }, [dep("A", "ghost")], "A", at(9, 5));
    expect(moves.size).toBe(1);
  });

  it("does nothing for a task it does not know", () => {
    const { moves } = run({ A: at(0, 5) }, [], "missing", at(9, 5));
    expect(moves.size).toBe(0);
  });

  it("stops on a dependency loop instead of pushing forever", () => {
    const { moves, cycleDetected } = run(
      { A: at(0, 5), B: at(5, 3), C: at(8, 2) },
      [dep("A", "B"), dep("B", "C"), dep("C", "A")],
      "A",
      at(10, 5)
    );
    expect(cycleDetected).toBe(true);
    expect(moves.size).toBeGreaterThan(0);
  });

  it("survives a task depending on itself", () => {
    const { cycleDetected } = run({ A: at(0, 5) }, [dep("A", "A")], "A", at(10, 5));
    expect(cycleDetected).toBe(true);
  });

  it("handles a long chain without giving up early", () => {
    const tasks: Record<string, RescheduleTask> = {};
    const deps: GanttDependency[] = [];
    for (let i = 0; i < 300; i++) {
      tasks[`T${i}`] = at(i * 2, 2);
      if (i > 0) deps.push(dep(`T${i - 1}`, `T${i}`));
    }
    const { moves, cycleDetected } = run(tasks, deps, "T0", at(100, 2));
    expect(cycleDetected).toBe(false);
    expect(moves.size).toBe(300);
    expect(moves.get("T299")).toEqual(at(100 + 299 * 2, 2));
  });

  it("leaves tasks that are not downstream alone", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(5, 3), X: at(0, 4) },
      [dep("A", "B")],
      "A",
      at(20, 5)
    );
    expect(moves.has("X")).toBe(false);
  });

  it("does not move a predecessor when its successor is dragged", () => {
    const { moves } = run(
      { A: at(0, 5), B: at(5, 3) },
      [dep("A", "B")],
      "B",
      at(30, 3)
    );
    expect(moves.has("A")).toBe(false);
    expect(moves.get("B")).toEqual(at(30, 3));
  });
});
