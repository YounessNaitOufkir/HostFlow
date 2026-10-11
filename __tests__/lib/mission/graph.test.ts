import { describe, it, expect } from "vitest";
import type { GanttDependency } from "@/lib/gantt/dependencies";
import { openSuccessorCounts } from "@/lib/mission/graph";

const dep = (sourceId: string, targetId: string): GanttDependency => ({
  id: `${sourceId}->${targetId}`,
  sourceId,
  targetId,
  type: "FS",
  lag: 0,
});
const allOpen = () => true;

describe("openSuccessorCounts", () => {
  it("counts distinct transitive open successors", () => {
    const counts = openSuccessorCounts([dep("A", "B"), dep("B", "C"), dep("A", "C")], allOpen);
    expect(counts.get("A")).toBe(2);
    expect(counts.get("B")).toBe(1);
    expect(counts.get("C")).toBe(0);
  });

  it("skips done successors but walks through them", () => {
    const counts = openSuccessorCounts([dep("A", "B"), dep("B", "C")], (id) => id !== "B");
    expect(counts.get("A")).toBe(1);
  });

  it("terminates on a cycle and never counts the item itself", () => {
    const counts = openSuccessorCounts([dep("A", "B"), dep("B", "A")], allOpen);
    expect(counts.get("A")).toBe(1);
    expect(counts.get("B")).toBe(1);
  });

  it("counts a diamond's shared tail once", () => {
    const counts = openSuccessorCounts([dep("A", "B"), dep("A", "C"), dep("B", "D"), dep("C", "D")], allOpen);
    expect(counts.get("A")).toBe(3);
  });

  it("returns an empty map with no links", () => expect(openSuccessorCounts([], allOpen).size).toBe(0));
});
