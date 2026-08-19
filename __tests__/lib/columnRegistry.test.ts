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
    "button",
  ];

  it("contains definitions for all 16 supported column types", () => {
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

  it("offers only the column types the board actually uses", () => {
    const essential = getColumnsByCategory("essential").map((c) => c.type);
    expect(essential).toEqual(
      expect.arrayContaining(["status", "text", "people", "timeline", "tags", "priority"])
    );
    expect(essential).not.toContain("numbers");
    expect(essential).not.toContain("date");
    expect(essential).not.toContain("files");

    const advanced = getColumnsByCategory("advanced").map((c) => c.type);
    expect(advanced).toEqual(expect.arrayContaining(["dependency", "checkbox"]));
    expect(advanced).not.toContain("link");
    expect(advanced).not.toContain("rating");
    expect(advanced).not.toContain("relation");
    expect(advanced).not.toContain("button");

    // formula is the only computed type and it is hidden, so the section is
    // empty - GroupSection must not render a heading over nothing.
    expect(getColumnsByCategory("computed")).toHaveLength(0);
  });

  it("keeps hidden types fully supported outside the menu", () => {
    // Hiding is additive: existing columns of these types still render, and the
    // importer can still create them from a spreadsheet. Deleting a registry
    // entry to remove it from the menu would break both - this pins that.
    const hidden: ColumnType[] = ["button", "formula", "rating", "link", "relation", "files", "date", "numbers"];
    hidden.forEach((type) => {
      expect(COLUMN_REGISTRY[type]).toBeDefined();
      expect(COLUMN_REGISTRY[type].hiddenFromMenu).toBe(true);
      expect(getColumnWidth(type)).toMatch(/^w-/);
      expect(getDefaultTitle(type)).toBeTruthy();
    });
  });

  it("verifies formula column aggregation metadata", () => {
    const formula = COLUMN_REGISTRY["formula"];
    expect(formula.isReadOnly).toBe(true);
    expect(formula.isAggregatable).toBe(true);
  });
});
