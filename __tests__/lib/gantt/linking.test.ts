import { describe, it, expect } from "vitest";
import {
  inferDependencyType,
  edgesOfType,
  validateNewLink,
  wouldCreateCycle,
  clampLag,
  describeDependency,
  SELECTABLE_DEPENDENCY_TYPES,
} from "@/lib/gantt/linking";
import type { GanttDependency } from "@/lib/gantt/dependencies";
import type { DependencyType } from "@/types";

function dep(sourceId: string, targetId: string, type: DependencyType = "FS"): GanttDependency {
  return { id: `${sourceId}->${targetId}`, sourceId, targetId, type, lag: 0 };
}

describe("inferDependencyType", () => {
  it("reads the type off the two edges the drag joined", () => {
    // Which end you leave and which end you land on is the whole choice.
    expect(inferDependencyType("finish", "start")).toBe("FS");
    expect(inferDependencyType("start", "start")).toBe("SS");
    expect(inferDependencyType("finish", "finish")).toBe("FF");
  });

  it("names no type for a start-to-finish drag", () => {
    // Start-to-finish is no longer offered. Null rather than a nearest guess:
    // quietly turning a deliberate gesture into a different rule is worse than
    // saying the rule is unavailable.
    expect(inferDependencyType("start", "finish")).toBeNull();
  });

  it("round-trips every type that can still be drawn", () => {
    for (const type of SELECTABLE_DEPENDENCY_TYPES) {
      const { from, to } = edgesOfType(type);
      expect(inferDependencyType(from, to)).toBe(type);
    }
  });

  it("offers exactly the three types a drag can name", () => {
    expect(SELECTABLE_DEPENDENCY_TYPES).toEqual(["FS", "SS", "FF"]);
  });
});

describe("wouldCreateCycle", () => {
  it("spots the edge that closes a loop", () => {
    // A → B → C already exists; C → A would close it.
    const chain = [dep("A", "B"), dep("B", "C")];
    expect(wouldCreateCycle(chain, "C", "A")).toBe(true);
    expect(wouldCreateCycle(chain, "B", "A")).toBe(true);
  });

  it("allows an edge that only shortens an existing path", () => {
    // A → C alongside A → B → C is a diamond, not a loop.
    expect(wouldCreateCycle([dep("A", "B"), dep("B", "C")], "A", "C")).toBe(false);
  });

  it("allows an edge into an unrelated task", () => {
    expect(wouldCreateCycle([dep("A", "B")], "B", "Z")).toBe(false);
  });

  it("treats a self-link as a loop", () => {
    expect(wouldCreateCycle([], "A", "A")).toBe(true);
  });

  it("follows a long chain without recursing", () => {
    const chain: GanttDependency[] = [];
    for (let i = 1; i < 5000; i++) chain.push(dep(`T${i - 1}`, `T${i}`));
    expect(wouldCreateCycle(chain, "T4999", "T0")).toBe(true);
    expect(wouldCreateCycle(chain, "T0", "T4999")).toBe(false);
  });

  it("terminates even when the graph already contains a loop", () => {
    const looped = [dep("A", "B"), dep("B", "A")];
    expect(wouldCreateCycle(looped, "B", "C")).toBe(false);
  });
});

describe("validateNewLink", () => {
  it("accepts an ordinary new link", () => {
    expect(validateNewLink([dep("A", "B")], "B", "C")).toEqual({ ok: true });
  });

  it("refuses a task depending on itself", () => {
    const result = validateNewLink([], "A", "A");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("self");
  });

  it("refuses a link that already exists", () => {
    const result = validateNewLink([dep("A", "B")], "A", "B");
    expect(result.reason).toBe("duplicate");
  });

  it("refuses the same pair drawn backwards", () => {
    // Not just a duplicate - two tasks each waiting on the other is a loop.
    const result = validateNewLink([dep("A", "B")], "B", "A");
    expect(result.reason).toBe("reverse-duplicate");
  });

  it("refuses a link that would close a longer loop", () => {
    const result = validateNewLink([dep("A", "B"), dep("B", "C")], "C", "A");
    expect(result.reason).toBe("cycle");
    expect(result.messageKey).toBe("gantt.linkCycle");
  });

  it("explains itself, since the drag simply will not take otherwise", () => {
    // A key rather than a sentence: this module has no locale, so the component
    // that shows the refusal is the one that puts it into words.
    for (const result of [
      validateNewLink([], "A", "A"),
      validateNewLink([dep("A", "B")], "A", "B"),
      validateNewLink([dep("A", "B"), dep("B", "C")], "C", "A"),
    ]) {
      expect(result.messageKey).toBeTruthy();
    }
  });
});

describe("clampLag", () => {
  it("keeps a lag to whole days within a year either way", () => {
    expect(clampLag(3)).toBe(3);
    expect(clampLag(-4)).toBe(-4);
    expect(clampLag(2.7)).toBe(2);
    expect(clampLag(-2.7)).toBe(-2);
    expect(clampLag(9999)).toBe(365);
    expect(clampLag(-9999)).toBe(-365);
  });

  it("treats an unparseable lag as none", () => {
    expect(clampLag(NaN)).toBe(0);
    expect(clampLag(Infinity)).toBe(0);
  });
});

describe("describeDependency", () => {
  /** Stands in for the app's translator, echoing the English dictionary. */
  const t = (key: string, vars?: Record<string, string | number>) => {
    const words: Record<string, string> = {
      "gantt.dep.FS": "Finish → Start",
      "gantt.dep.SS": "Start → Start",
      "gantt.dep.FF": "Finish → Finish",
      "gantt.depLater": "{name}, {days}d later",
      "gantt.depOverlap": "{name}, {days}d overlap",
    };
    return Object.entries(vars ?? {}).reduce<string>(
      (out, [k, v]) => out.replace(`{${k}}`, String(v)),
      words[key] ?? key
    );
  };

  it("names the link in words rather than a two-letter code", () => {
    expect(describeDependency(t, "FS", 0)).toBe("Finish → Start");
    expect(describeDependency(t, "SS", 3)).toBe("Start → Start, 3d later");
    expect(describeDependency(t, "FF", -2)).toBe("Finish → Finish, 2d overlap");
  });
});
