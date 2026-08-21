import { describe, it, expect } from "vitest";
import {
  DONE_STATUS_PATTERN,
  isDoneStatusValue,
  firstStatusValue,
} from "@/lib/statusSemantics";

describe("statusSemantics", () => {
  describe("isDoneStatusValue", () => {
    it("recognises the English done labels", () => {
      expect(isDoneStatusValue("Done")).toBe(true);
      expect(isDoneStatusValue("done")).toBe(true);
      expect(isDoneStatusValue("Completed")).toBe(true);
    });

    it("recognises the French labels an imported board uses", () => {
      // The Shared Import Test board's labels are Fait / En cours / Bloqué / En retard.
      expect(isDoneStatusValue("Fait")).toBe(true);
      expect(isDoneStatusValue("Terminé")).toBe(true);
      expect(isDoneStatusValue("Termine")).toBe(true);
      expect(isDoneStatusValue("Achevée")).toBe(true);
    });

    it("does not treat unfinished work as done", () => {
      expect(isDoneStatusValue("Working on it")).toBe(false);
      expect(isDoneStatusValue("Stuck")).toBe(false);
      expect(isDoneStatusValue("En cours")).toBe(false);
      expect(isDoneStatusValue("Bloqué")).toBe(false);
      expect(isDoneStatusValue("Not Started")).toBe(false);
    });

    it("does not treat an overdue tag as done", () => {
      // The engine writes this value, so mistaking it for done would make an
      // overdue task disappear from the digest entirely.
      expect(isDoneStatusValue("Overdue")).toBe(false);
      expect(isDoneStatusValue("En retard")).toBe(false);
    });

    it("handles absent and non-string values", () => {
      expect(isDoneStatusValue(null)).toBe(false);
      expect(isDoneStatusValue(undefined)).toBe(false);
      expect(isDoneStatusValue("")).toBe(false);
      expect(isDoneStatusValue({ label: "Done" })).toBe(false);
    });

    it("is stateless across calls", () => {
      // A /g regex would alternate results through lastIndex; this one must not.
      expect(DONE_STATUS_PATTERN.test("Done")).toBe(true);
      expect(DONE_STATUS_PATTERN.test("Done")).toBe(true);
      expect(DONE_STATUS_PATTERN.test("Done")).toBe(true);
    });
  });

  describe("firstStatusValue", () => {
    const columns = [
      { id: "col-date", type: "date" },
      { id: "col-status", type: "status" },
      { id: "col-status-2", type: "status" },
    ];

    it("returns the first status column that holds a value", () => {
      expect(firstStatusValue(columns, { "col-status": "Fait" })).toBe("Fait");
    });

    it("skips a status column that is empty and takes the next", () => {
      expect(
        firstStatusValue(columns, { "col-status": "", "col-status-2": "Stuck" })
      ).toBe("Stuck");
    });

    it("ignores columns that are not status columns", () => {
      expect(firstStatusValue(columns, { "col-date": "2026-01-01" })).toBeNull();
    });

    it("returns null when nothing is set", () => {
      expect(firstStatusValue(columns, {})).toBeNull();
      expect(firstStatusValue(columns, null)).toBeNull();
      expect(firstStatusValue([], { "col-status": "Done" })).toBeNull();
    });
  });
});
