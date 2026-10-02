import { describe, it, expect } from "vitest";
import { defaultCellLabel, withCellDefaults, withoutBlankOption, isBlankCellValue } from "@/lib/cellDefaults";
import type { Column } from "@/types";

const status = (labels?: string[]) =>
  ({
    id: "st",
    title: "Status",
    type: "status",
    settings: labels ? { statusLabels: labels.map((label) => ({ label, color: "" })) } : undefined,
  }) as Column;
const priority = (labels?: string[]) =>
  ({
    id: "pr",
    title: "Priority",
    type: "priority",
    settings: labels ? { priorityLabels: labels.map((label) => ({ label, color: "" })) } : undefined,
  }) as Column;

describe("defaultCellLabel", () => {
  it("uses Not Started / Low on columns with the built-in options", () => {
    expect(defaultCellLabel(status())).toBe("Not Started");
    expect(defaultCellLabel(priority())).toBe("Low");
  });

  it("uses the column's own label, in French too", () => {
    expect(defaultCellLabel(status(["Non commencé", "Fait", "En cours"]))).toBe("Non commencé");
    expect(defaultCellLabel(priority(["Critique", "Élevée", "Moyenne", "Basse", "Empty"]))).toBe("Basse");
  });

  it("gives no default when the column offers nothing like it", () => {
    expect(defaultCellLabel(status(["Fait", "En cours", "Bloqué", "En retard"]))).toBeNull();
  });
});

describe("withCellDefaults", () => {
  const cols = [status(), priority(), { id: "tx", title: "Notes", type: "text" } as Column];

  it("fills blank, missing and Empty values only", () => {
    expect(withCellDefaults(cols, {})).toEqual({ st: "Not Started", pr: "Low" });
    expect(withCellDefaults(cols, { st: "", pr: "Empty" })).toEqual({ st: "Not Started", pr: "Low" });
    expect(withCellDefaults(cols, { st: "Done", pr: "High", tx: "" })).toEqual({ st: "Done", pr: "High", tx: "" });
  });
});

describe("blank options", () => {
  it("drops Empty and blank labels", () => {
    expect(withoutBlankOption([{ label: "Low" }, { label: "Empty" }, { label: "" }])).toEqual([{ label: "Low" }]);
    expect(isBlankCellValue("Low")).toBe(false);
  });
});
