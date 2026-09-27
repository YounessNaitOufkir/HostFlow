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

describe("scope", () => {
  const onBoard = (scopeId: string, t: ScheduleTaskInput) => ({ ...t, scopeId });

  it("gives each board its own finish date in project scope", () => {
    // Board 1 finishes on day 4, board 2 on day 19. Measured against one shared
    // finish, board 1's whole chain would show 15 days of slack.
    const { tasks: s, criticalIds } = computeSchedule(
      [
        onBoard("b1", task("A", 0, 2)),
        onBoard("b1", task("B", 2, 3)),
        onBoard("b2", task("X", 0, 10)),
        onBoard("b2", task("Y", 10, 10)),
      ],
      [dep("A", "B"), dep("X", "Y")]
    );
    expect(s.get("A")!.totalFloat).toBe(0);
    expect(s.get("B")!.totalFloat).toBe(0);
    expect(Array.from(criticalIds).sort()).toEqual(["A", "B", "X", "Y"]);
  });

  it("still measures a board's shorter chain against that board's finish", () => {
    const { tasks: s } = computeSchedule(
      [
        onBoard("b1", task("A", 0, 2)),
        onBoard("b1", task("B", 2, 2)),
        onBoard("b1", task("C", 0, 10)),
      ],
      [dep("A", "B")]
    );
    // B ends on day 3, the board on day 9.
    expect(s.get("B")!.totalFloat).toBe(6);
    expect(s.get("C")!.isCritical).toBe(true);
  });

  it("treats boards joined by a link as one project", () => {
    const { tasks: s } = computeSchedule(
      [
        onBoard("b1", task("A", 0, 2)),
        onBoard("b1", task("Short", 0, 1)),
        onBoard("b2", task("X", 2, 10)),
      ],
      [dep("A", "X")]
    );
    // One project finishing on day 11, so board 1's unlinked task has 11 days.
    expect(s.get("A")!.isCritical).toBe(true);
    expect(s.get("Short")!.totalFloat).toBe(11);
  });

  it("gives each chain its own path in chain scope", () => {
    const { tasks: s, criticalIds } = computeSchedule(
      [task("A", 0, 2), task("B", 2, 2), task("X", 0, 10), task("Y", 10, 10)],
      [dep("A", "B"), dep("X", "Y")],
      { scope: "chain" }
    );
    expect(s.get("A")!.totalFloat).toBe(0);
    expect(Array.from(criticalIds).sort()).toEqual(["A", "B", "X", "Y"]);
  });

  it("keeps an unlinked task off every path in chain scope", () => {
    const { tasks: s, criticalIds } = computeSchedule(
      [task("A", 0, 2), task("B", 2, 2), task("Alone", 0, 30)],
      [dep("A", "B")],
      { scope: "chain" }
    );
    expect(s.get("Alone")!.unlinked).toBe(true);
    expect(s.get("Alone")!.isCritical).toBe(false);
    // And it no longer sets anyone else's finish date.
    expect(s.get("A")!.totalFloat).toBe(0);
    expect(criticalIds.has("Alone")).toBe(false);
  });

  it("never marks a task unlinked in project scope", () => {
    const { tasks: s } = computeSchedule([task("A", 0, 2)], []);
    expect(s.get("A")!.unlinked).toBe(false);
  });
});

describe("finished tasks", () => {
  const done = (t: ScheduleTaskInput) => ({ ...t, done: true });

  it("takes a finished task off the path", () => {
    const { tasks: s, criticalIds } = computeSchedule(
      [done(task("A", 0, 2)), task("B", 2, 2), task("C", 4, 2)],
      [dep("A", "B"), dep("B", "C")]
    );
    expect(s.get("A")!.done).toBe(true);
    expect(s.get("A")!.isCritical).toBe(false);
    expect(Array.from(criticalIds).sort()).toEqual(["B", "C"]);
  });

  it("still holds back the task waiting on it", () => {
    const { tasks: s } = computeSchedule(
      [done(task("A", 0, 5)), task("B", 0, 2)],
      [dep("A", "B")]
    );
    expect(s.get("B")!.earlyStart).toBe(5);
  });

  it("does not set the finish date when it ends last", () => {
    // A's end was left in the future after it was finished. Measured against
    // it, B would show 18 days of slack it does not have.
    const { tasks: s } = computeSchedule([done(task("A", 0, 20)), task("B", 0, 2)], []);
    expect(s.get("B")!.totalFloat).toBe(0);
    expect(s.get("B")!.isCritical).toBe(true);
  });

  it("marks nothing critical once everything is finished", () => {
    const { criticalIds } = computeSchedule(
      [done(task("A", 0, 2)), done(task("B", 2, 2))],
      [dep("A", "B")]
    );
    expect(criticalIds.size).toBe(0);
  });

  it("gives an unfinished predecessor no deadline from a finished successor", () => {
    // Out-of-order progress: B was finished although A was not.
    const { tasks: s } = computeSchedule(
      [task("A", 0, 2), done(task("B", 2, 2)), task("C", 0, 10)],
      [dep("A", "B")]
    );
    // A answers to the project finish (day 9), not to B's start.
    expect(s.get("A")!.totalFloat).toBe(8);
  });
});

describe("overdue work", () => {
  // "Today" is day 10 throughout.
  const overdue = (t: ScheduleTaskInput) => ({ ...t, finishNoEarlierThan: 10 });

  it("counts an unfinished overdue task as finishing today", () => {
    const { tasks: s } = computeSchedule([overdue(task("A", 0, 5))], []);
    expect(s.get("A")!.earlyFinish).toBe(10);
    expect(s.get("A")!.earlyStart).toBe(0);
    expect(s.get("A")!.late).toBe(true);
  });

  it("pushes what waits on it, so the slip shows down the chain", () => {
    const { tasks: s, projectFinish } = computeSchedule(
      [overdue(task("A", 0, 5)), task("B", 5, 3)],
      [dep("A", "B")]
    );
    expect(s.get("B")!.earlyStart).toBe(11);
    expect(projectFinish).toBe(13);
  });

  it("makes a late chain critical over one that looked longer on paper", () => {
    const { criticalIds } = computeSchedule(
      [overdue(task("A", 0, 5)), task("B", 5, 3), task("C", 0, 12)],
      [dep("A", "B")]
    );
    // On entered dates C (ends day 11) drove the finish; A → B now ends day 13.
    expect(Array.from(criticalIds).sort()).toEqual(["A", "B"]);
  });

  it("leaves a task alone when its end is still ahead", () => {
    const { tasks: s } = computeSchedule([{ ...task("A", 0, 15), finishNoEarlierThan: 10 }], []);
    expect(s.get("A")!.earlyFinish).toBe(14);
    expect(s.get("A")!.late).toBe(false);
  });

  it("never counts a finished task as late", () => {
    const { tasks: s } = computeSchedule([{ ...overdue(task("A", 0, 5)), done: true }], []);
    expect(s.get("A")!.earlyFinish).toBe(4);
    expect(s.get("A")!.late).toBe(false);
  });

  it("still judges broken links on the entered dates", () => {
    // B starts right after A's entered end: the link holds as typed, even
    // though A is running late.
    const { violations } = computeSchedule(
      [overdue(task("A", 0, 5)), task("B", 5, 3)],
      [dep("A", "B")]
    );
    expect(violations).toHaveLength(0);
  });
});

describe("target finish", () => {
  const due = (t: ScheduleTaskInput, targetFinish: number) => ({ ...t, targetFinish });

  it("shows how late the driving chain is as negative float", () => {
    // The chain ends on day 9; the board has to be done by day 6.
    const { tasks: s, criticalIds } = computeSchedule(
      [due(task("A", 0, 5), 6), due(task("B", 5, 5), 6), due(task("C", 0, 2), 6)],
      [dep("A", "B")]
    );
    expect(s.get("B")!.totalFloat).toBe(-3);
    expect(s.get("A")!.totalFloat).toBe(-3);
    // C still has room before the target itself.
    expect(s.get("C")!.totalFloat).toBe(5);
    expect(Array.from(criticalIds).sort()).toEqual(["A", "B"]);
  });

  it("changes nothing when the target is later than the plan", () => {
    const { tasks: s } = computeSchedule(
      [due(task("A", 0, 5), 30), due(task("B", 0, 2), 30)],
      []
    );
    expect(s.get("A")!.totalFloat).toBe(0);
    expect(s.get("B")!.totalFloat).toBe(3);
  });

  it("holds each board to its own target", () => {
    const { tasks: s } = computeSchedule(
      [
        { ...due(task("A", 0, 10), 7), scopeId: "b1" },
        { ...task("X", 0, 10), scopeId: "b2" },
      ],
      []
    );
    expect(s.get("A")!.totalFloat).toBe(-2);
    expect(s.get("X")!.totalFloat).toBe(0);
  });

  it("holds linked boards to the earlier of their targets", () => {
    const { tasks: s } = computeSchedule(
      [
        { ...due(task("A", 0, 3), 20), scopeId: "b1" },
        { ...due(task("X", 3, 5), 5), scopeId: "b2" },
      ],
      [dep("A", "X")]
    );
    // One project, ending day 7, due day 5.
    expect(s.get("A")!.totalFloat).toBe(-2);
  });
});

describe("near-critical threshold", () => {
  const plan = [task("A", 0, 2), task("B", 2, 4), task("C", 6, 3), task("D", 2, 3), task("E", 9, 2)];
  const links = [dep("A", "B"), dep("B", "C"), dep("C", "E"), dep("A", "D"), dep("D", "E")];

  it("keeps the textbook path at zero", () => {
    const { criticalIds } = computeSchedule(plan, links);
    expect(criticalIds.has("D")).toBe(false);
  });

  it("takes in tasks within the threshold, and their arrows", () => {
    // D has 4 days of float.
    expect(computeSchedule(plan, links, { criticalThreshold: 3 }).criticalIds.has("D")).toBe(false);
    const { criticalIds, criticalDependencyIds } = computeSchedule(plan, links, {
      criticalThreshold: 5,
    });
    expect(criticalIds.has("D")).toBe(true);
    expect(criticalDependencyIds.has("A->D")).toBe(true);
  });

  it("never flags a finished task, whatever the threshold", () => {
    const { criticalIds } = computeSchedule(
      [{ ...task("A", 0, 2), done: true }, task("B", 0, 10)],
      [],
      { criticalThreshold: 30 }
    );
    expect(criticalIds.has("A")).toBe(false);
  });
});

describe("free float", () => {
  it("is the gap before the next task, not before the finish", () => {
    // A (0-1) → B starts day 5: A can slip 3 days before B moves. B ends
    // day 6, the project day 19, so A's total float is 16.
    const { tasks: s } = computeSchedule(
      [task("A", 0, 2), task("B", 5, 2), task("Z", 0, 20)],
      [dep("A", "B")]
    );
    expect(s.get("A")!.freeFloat).toBe(3);
    expect(s.get("A")!.totalFloat).toBe(16);
  });

  it("equals total float for a task with nothing after it", () => {
    const { tasks: s } = computeSchedule([task("A", 0, 2), task("Z", 0, 10)], []);
    expect(s.get("A")!.freeFloat).toBe(8);
  });

  it("takes the tightest of several successors, by link type", () => {
    const { tasks: s } = computeSchedule(
      [task("A", 0, 3), task("B", 6, 2), task("C", 1, 5), task("Z", 0, 30)],
      [dep("A", "B"), dep("A", "C", "SS", 0)]
    );
    // FS to B: 6 - 3 = 3. SS to C: C starts day 1, A day 0: 1.
    expect(s.get("A")!.freeFloat).toBe(1);
  });

  it("is zero on the critical path and never negative", () => {
    const { tasks: s } = computeSchedule(
      [task("A", 0, 5), task("B", 2, 3)],
      [dep("A", "B")] // broken: B starts before A finishes
    );
    expect(s.get("A")!.freeFloat).toBe(0);
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

  it("start-to-start ties the successor's start to the predecessor's", () => {
    const { tasks: s } = computeSchedule(
      [task("A", 10, 3), task("B", 0, 4)],
      [dep("A", "B", "SS")]
    );
    expect(s.get("B")!.earlyStart).toBe(10);
    expect(s.get("B")!.earlyFinish).toBe(13);
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
