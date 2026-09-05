import { describe, it, expect } from "vitest";
import {
  DONE_STATUS_PATTERN,
  isDoneStatusValue,
  isStuckStatusValue,
  isWorkingStatusValue,
  firstStatusValue,
  itemIsDone,
  itemStatusSemantic,
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

describe("negated labels are not their own opposite", () => {
  // Each of these used to read as FINISHED, because the pattern matches
  // anywhere in the string. The overdue rule skipped them, the digest left
  // them out and the dashboard counted them complete - the exact items that
  // most needed chasing went silent.
  it.each([
    "Not done",
    "Undone",
    "Not completed",
    "Never completed",
    "Non terminé",
    "Pas terminé",
    "Incomplete",
    "Invalid",
  ])("%s is not done", (label) => {
    expect(isDoneStatusValue(label)).toBe(false);
  });

  it.each(["Not blocked", "Unblocked", "Débloqué", "Non bloqué"])(
    "%s is not stuck",
    (label) => {
      expect(isStuckStatusValue(label)).toBe(false);
    }
  );

  it("still recognises the plain words", () => {
    expect(isDoneStatusValue("Done")).toBe(true);
    expect(isDoneStatusValue("Terminé")).toBe(true);
    expect(isDoneStatusValue("Fait")).toBe(true);
    expect(isStuckStatusValue("Bloqué")).toBe(true);
    expect(isWorkingStatusValue("En cours")).toBe(true);
  });

  it("recognises done words the old vocabulary missed", () => {
    for (const label of ["Finished", "Closed", "Clôturé", "Archivé", "Livré", "Résolu"]) {
      expect(isDoneStatusValue(label)).toBe(true);
    }
  });
});

describe("a declared semantic beats the words", () => {
  const options = [
    { label: "Fait à 50%", color: "", semantic: "working" as const },
    { label: "Bon pour paiement", color: "", semantic: "done" as const },
    { label: "En attente client", color: "", semantic: "stuck" as const },
  ];

  it("believes the board over the pattern", () => {
    // "Fait à 50%" contains "fait", so the fallback calls it finished. It is
    // half done, which is exactly the sort of thing only the board can say.
    expect(isDoneStatusValue("Fait à 50%")).toBe(true);
    expect(isDoneStatusValue("Fait à 50%", options)).toBe(false);
    expect(isWorkingStatusValue("Fait à 50%", options)).toBe(true);
  });

  it("finds meaning the words could never carry", () => {
    // No pattern would ever guess these two.
    expect(isDoneStatusValue("Bon pour paiement")).toBe(false);
    expect(isDoneStatusValue("Bon pour paiement", options)).toBe(true);
    expect(isStuckStatusValue("En attente client", options)).toBe(true);
  });

  it("matches the label regardless of case or padding", () => {
    expect(isDoneStatusValue("  bon POUR paiement ", options)).toBe(true);
  });

  it("falls back for a value the board never declared", () => {
    expect(isDoneStatusValue("Done", options)).toBe(true);
  });
});

describe("reading an item's status through its board", () => {
  const columns: Parameters<typeof itemStatusSemantic>[0] = [
    { id: "name", type: "text" },
    {
      id: "state",
      type: "status",
      settings: {
        statusLabels: [
          { label: "On site", semantic: "working" },
          { label: "Signed off", semantic: "done" },
          { label: "Waiting on client", semantic: "stuck" },
        ],
      },
    },
  ];

  it("uses the labels the board declared, not the words in them", () => {
    // "On site" matches no pattern in either language. Before the board's own
    // labels were consulted the dashboard read it as nothing at all, and showed
    // zero work in progress on a board where three tasks were underway.
    expect(itemStatusSemantic(columns, { state: "On site" })).toBe("working");
    expect(itemStatusSemantic(columns, { state: "Signed off" })).toBe("done");
    expect(itemStatusSemantic(columns, { state: "Waiting on client" })).toBe("stuck");
  });

  it("says a task is finished when the board says so", () => {
    expect(itemIsDone(columns, { state: "Signed off" })).toBe(true);
    expect(itemIsDone(columns, { state: "On site" })).toBe(false);
  });

  it("still falls back to the words for a board that declared nothing", () => {
    const bare = [{ id: "state", type: "status" }];
    expect(itemIsDone(bare, { state: "Terminé" })).toBe(true);
    expect(itemIsDone(bare, { state: "Not done" })).toBe(false);
  });

  it("takes the first status column that holds a value", () => {
    const two = [
      { id: "a", type: "status" },
      { id: "b", type: "status" },
    ];
    expect(itemIsDone(two, { a: "", b: "Done" })).toBe(true);
    expect(itemIsDone(two, { a: "Stuck", b: "Done" })).toBe(false);
  });

  it("is false for an item with no status at all", () => {
    expect(itemStatusSemantic(columns, {})).toBe(null);
    expect(itemIsDone(columns, null)).toBe(false);
  });
});
