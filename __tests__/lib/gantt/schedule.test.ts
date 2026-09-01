import { describe, it, expect } from "vitest";
import { computeSchedule, type ScheduleTaskInput } from "@/lib/gantt/schedule";
import type { GanttDependency } from "@/lib/gantt/dependencies";
import type { DependencyType } from "@/types";

/** A task occupying days [start, start + days - 1]. */
function task(id: string, start: number, days: number): ScheduleTaskInput {
  return { id, start, end: start + days - 1 };
}

function dep(
  sourceId: string,
  targetId: string,
  type: DependencyType = "FS",
  lag = 0
): GanttDependency {
  return { id: `${sourceId}->${targetId}`, sourceId, targetId, type, lag };
}

describe("critical path", () => {
  /**
   * Two routes from A to E, hand-computed:
   *
   *        ┌── B(4) ── C(3) ──┐
   *   A(2) ┤                  ├── E(2)
   *        └────── D(3) ──────┘
   *
   * A: days 0-1. Upper route B 2-5, C 6-8, so E can start on 9.
   * Lower route D 2-4, so E could start on 5 — three days of slack.
   * The critical path is therefore A → B → C → E, and D carries 4 days of float
   * (it may start as late as day 6 and still finish before E begins on 9).
   */
  const tasks = [
    task("A", 0, 2),
    task("B", 2, 4),
    task("C", 6, 3),
    task("D", 2, 3),
    task("E", 9, 2),
  ];
  const deps = [dep("A", "B"), dep("B", "C"), dep("C", "E"), dep("A", "D"), dep("D", "E")];

  it("computes the early pass from the dependencies", () => {
    const { tasks: s } = computeSchedule(tasks, deps);
    expect([s.get("A")!.earlyStart, s.get("A")!.earlyFinish]).toEqual([0, 1]);
    expect([s.get("B")!.earlyStart, s.get("B")!.earlyFinish]).toEqual([2, 5]);
    expect([s.get("C")!.earlyStart, s.get("C")!.earlyFinish]).toEqual([6, 8]);
    expect([s.get("D")!.earlyStart, s.get("D")!.earlyFinish]).toEqual([2, 4]);
    expect([s.get("E")!.earlyStart, s.get("E")!.earlyFinish]).toEqual([9, 10]);
  });

  it("computes the late pass back from the project finish", () => {
    const { tasks: s, projectFinish } = computeSchedule(tasks, deps);
    expect(projectFinish).toBe(10);
    expect([s.get("E")!.lateStart, s.get("E")!.lateFinish]).toEqual([9, 10]);
    expect([s.get("C")!.lateStart, s.get("C")!.lateFinish]).toEqual([6, 8]);
    // D only has to finish by day 8, so it may start as late as day 6.
    expect([s.get("D")!.lateStart, s.get("D")!.lateFinish]).toEqual([6, 8]);
  });

  it("reports float, and marks the zero-float chain critical", () => {
    const { tasks: s, criticalIds } = computeSchedule(tasks, deps);
    expect(s.get("D")!.totalFloat).toBe(4);
    expect(s.get("D")!.isCritical).toBe(false);
    for (const id of ["A", "B", "C", "E"]) {
      expect(s.get(id)!.totalFloat).toBe(0);
      expect(s.get(id)!.isCritical).toBe(true);
    }
    expect(Array.from(criticalIds).sort()).toEqual(["A", "B", "C", "E"]);
  });

  it("names the arrows that make up the path", () => {
    const { criticalDependencyIds } = computeSchedule(tasks, deps);
    expect(Array.from(criticalDependencyIds).sort()).toEqual([
      "A->B",
      "B->C",
      "C->E",
    ]);
  });

  it("makes every task critical when the plan is one chain", () => {
    const { criticalIds } = computeSchedule(
      [task("A", 0, 2), task("B", 2, 2), task("C", 4, 2)],
      [dep("A", "B"), dep("B", "C")]
    );
    expect(criticalIds.size).toBe(3);
  });

  it("treats an unlinked task as critical only if it ends with the project", () => {
    const { tasks: s } = computeSchedule([task("A", 0, 5), task("B", 0, 2)], []);
    expect(s.get("A")!.isCritical).toBe(true); // it sets the finish date
    expect(s.get("B")!.totalFloat).toBe(3);
    expect(s.get("B")!.isCritical).toBe(false);
  });
});

describe("dependency types and lag", () => {
  it("finish-to-start puts the successor the day after", () => {
    const { tasks: s } = computeSchedule(
      [task("A", 0, 3), task("B", 0, 2)],
      [dep("A", "B", "FS")]
    );
    expect(s.get("B")!.earlyStart).toBe(3);
  });

  it("start-to-start lines the two up on the same day", () => {
    const { tasks: s } = computeSchedule(
      [task("A", 5, 3), task("B", 0, 2)],
      [dep("A", "B", "SS")]
    );
    expect(s.get("B")!.earlyStart).toBe(5);
  });

  it("finish-to-finish makes them land together", () => {
    const { tasks: s } = computeSchedule(
      [task("A", 0, 5), task("B", 0, 2)],
      [dep("A", "B", "FF")]
    );
    // A finishes on day 4, so B's two days must be 3-4.
    expect([s.get("B")!.earlyStart, s.get("B")!.earlyFinish]).toEqual([3, 4]);
  });

  it("start-to-finish ties the successor's finish to the predecessor's start", () => {
    const { tasks: s } = computeSchedule(
      [task("A", 10, 3), task("B", 0, 4)],
      [dep("A", "B", "SF")]
    );
    expect(s.get("B")!.earlyFinish).toBe(10);
    expect(s.get("B")!.earlyStart).toBe(7);
  });

  it("delays by a positive lag", () => {
    const { tasks: s } = computeSchedule(
      [task("A", 0, 3), task("B", 0, 2)],
      [dep("A", "B", "FS", 2)]
    );
    // Three days of curing after A finishes on day 2.
    expect(s.get("B")!.earlyStart).toBe(5);
  });

  it("overlaps by a negative lag", () => {
    const { tasks: s } = computeSchedule(
      [task("A", 0, 10), task("B", 0, 3)],
      [dep("A", "B", "FS", -4)]
    );
    expect(s.get("B")!.earlyStart).toBe(6);
  });

  it("reads a link with no recorded type as finish-to-start", () => {
    const untyped = {
      id: "x",
      sourceId: "A",
      targetId: "B",
      type: "FS",
      lag: 0,
    } as GanttDependency;
    const { tasks: s } = computeSchedule([task("A", 0, 3), task("B", 0, 2)], [untyped]);
    expect(s.get("B")!.earlyStart).toBe(3);
  });
});

describe("violations", () => {
  it("catches a successor that starts before its predecessor finishes", () => {
    // The old chart drew this arrow exactly like a valid one, pointing backwards.
    const { violations } = computeSchedule(
      [task("A", 0, 5), task("B", 2, 3)],
      [dep("A", "B")]
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      sourceId: "A",
      targetId: "B",
      type: "FS",
      overlapDays: 3, // B should start on day 5, it starts on day 2
    });
    expect(violations[0].message).toContain("3 days too early");
  });

  it("counts a lag as part of what was promised", () => {
    const { violations } = computeSchedule(
      [task("A", 0, 3), task("B", 3, 2)],
      [dep("A", "B", "FS", 2)]
    );
    expect(violations[0].overlapDays).toBe(2);
  });

  it("says nothing about a plan that holds", () => {
    expect(
      computeSchedule([task("A", 0, 3), task("B", 3, 2)], [dep("A", "B")]).violations
    ).toHaveLength(0);
  });

  it("checks each type against the right pair of dates", () => {
    // SS: B may not start before A does.
    expect(
      computeSchedule([task("A", 5, 3), task("B", 2, 3)], [dep("A", "B", "SS")]).violations
    ).toHaveLength(1);
    expect(
      computeSchedule([task("A", 5, 3), task("B", 5, 3)], [dep("A", "B", "SS")]).violations
    ).toHaveLength(0);

    // FF: B may not finish before A does.
    expect(
      computeSchedule([task("A", 0, 5), task("B", 0, 2)], [dep("A", "B", "FF")]).violations
    ).toHaveLength(1);
    expect(
      computeSchedule([task("A", 0, 5), task("B", 0, 5)], [dep("A", "B", "FF")]).violations
    ).toHaveLength(0);
  });
});

describe("cycles", () => {
  it("reports a loop instead of hanging or inventing float", () => {
    const { cycleIds, tasks: s } = computeSchedule(
      [task("A", 0, 2), task("B", 2, 2), task("C", 4, 2)],
      [dep("A", "B"), dep("B", "C"), dep("C", "A")]
    );
    expect(Array.from(cycleIds).sort()).toEqual(["A", "B", "C"]);
    for (const id of ["A", "B", "C"]) {
      expect(s.get(id)!.inCycle).toBe(true);
      expect(s.get(id)!.isCritical).toBe(false);
    }
  });

  it("still schedules the part of the plan outside the loop", () => {
    const { cycleIds, tasks: s } = computeSchedule(
      [task("A", 0, 2), task("B", 2, 2), task("X", 0, 3), task("Y", 3, 2)],
      [dep("A", "B"), dep("B", "A"), dep("X", "Y")]
    );
    expect(Array.from(cycleIds).sort()).toEqual(["A", "B"]);
    expect(s.get("Y")!.inCycle).toBe(false);
    expect(s.get("Y")!.earlyStart).toBe(3);
  });

  it("survives a task depending on itself", () => {
    const { cycleIds } = computeSchedule([task("A", 0, 2)], [dep("A", "A")]);
    expect(cycleIds.has("A")).toBe(true);
  });
});

describe("robustness", () => {
  it("returns an empty result for an empty plan", () => {
    const result = computeSchedule([], []);
    expect(result.tasks.size).toBe(0);
    expect(result.criticalIds.size).toBe(0);
  });

  it("ignores a dependency pointing at a task that is not on the chart", () => {
    const { tasks: s, violations } = computeSchedule(
      [task("A", 0, 2)],
      [dep("A", "ghost"), dep("ghost", "A")]
    );
    expect(s.size).toBe(1);
    expect(violations).toHaveLength(0);
  });

  it("gives a same-day task a duration of one", () => {
    const { tasks: s } = computeSchedule([{ id: "M", start: 4, end: 4 }], []);
    expect(s.get("M")!.duration).toBe(1);
  });

  it("scales to a long chain without blowing the stack", () => {
    const chain: ScheduleTaskInput[] = [];
    const links: GanttDependency[] = [];
    for (let i = 0; i < 2000; i++) {
      chain.push(task(`T${i}`, i * 2, 2));
      if (i > 0) links.push(dep(`T${i - 1}`, `T${i}`));
    }
    const { criticalIds, violations } = computeSchedule(chain, links);
    expect(criticalIds.size).toBe(2000);
    expect(violations).toHaveLength(0);
  });
});
