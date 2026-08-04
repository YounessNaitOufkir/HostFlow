import { describe, it, expect } from "vitest";
import {
  COLUMN_REGISTRY,
  getColumnsByCategory,
  getColumnWidth,
  getDefaultTitle,
} from "@/lib/columnRegistry";
import type { ColumnType } from "@/types";

describe("Column Registry — Batch 2", () => {
  const allTypes: ColumnType[] = [
    "status",
    "text",
    "date",
    "numbers",
    "people",
    "timeline",
    "tags",
    "priority",
    "files",
    "dependency",
    "formula",
    "checkbox",
    "link",
    "rating",
    "relation",
  ];

  it("contains definitions for all 15 supported column types", () => {
    allTypes.forEach((type) => {
      const def = COLUMN_REGISTRY[type];
      expect(def).toBeDefined();
      expect(def.type).toBe(type);
      expect(def.label).toBeTruthy();
      expect(def.defaultTitle).toBeTruthy();
      expect(def.widthClass).toMatch(/^w-\d+/);
    });
  });

  it("returns correct column widths via getColumnWidth", () => {
    expect(getColumnWidth("status")).toBe("w-32");
    expect(getColumnWidth("text")).toBe("w-48");
    expect(getColumnWidth("checkbox")).toBe("w-24");
    // Fallback for unknown type
    expect(getColumnWidth("unknown_type" as any)).toBe("w-32");
  });

  it("returns default titles via getDefaultTitle", () => {
    expect(getDefaultTitle("status")).toBe("Status");
    expect(getDefaultTitle("date")).toBe("Date");
    expect(getDefaultTitle("people")).toBe("Assignee");
    // Fallback for unknown type capitalizes first char
    expect(getDefaultTitle("custom" as any)).toBe("Custom");
  });

  it("filters columns correctly by category", () => {
    const essential = getColumnsByCategory("essential");
    expect(essential.map((c) => c.type)).toContain("status");
    expect(essential.map((c) => c.type)).toContain("text");
    expect(essential.map((c) => c.type)).toContain("priority");

    const advanced = getColumnsByCategory("advanced");
    expect(advanced.map((c) => c.type)).toContain("dependency");
    expect(advanced.map((c) => c.type)).toContain("checkbox");
    expect(advanced.map((c) => c.type)).toContain("link");

    const computed = getColumnsByCategory("computed");
    expect(computed.map((c) => c.type)).toContain("formula");
  });

  it("verifies formula column aggregation metadata", () => {
    const formula = COLUMN_REGISTRY["formula"];
    expect(formula.isReadOnly).toBe(true);
    expect(formula.isAggregatable).toBe(true);
  });
});
