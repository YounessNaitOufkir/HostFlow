import { describe, it, expect } from "vitest";
import type { Board } from "@/types";
import { targetFinishOf } from "@/lib/gantt/config";

function withConfig(gantt_config: Board["gantt_config"]): Board {
  return { id: "b1", name: "Board", description: "", columns: [], gantt_config };
}

describe("target finish", () => {
  it("parses the stored date, and ignores one that does not parse", () => {
    expect(targetFinishOf(withConfig({ targetFinish: "2026-03-12" }))).toEqual(new Date(2026, 2, 12));
    expect(targetFinishOf(withConfig({ targetFinish: "soon" }))).toBeNull();
    expect(targetFinishOf(withConfig(null))).toBeNull();
  });
});
