import { describe, it, expect } from "vitest";
import type { Column } from "@/types";
import { describeColumn, FieldError, findColumn, parseFieldValue, readFieldValue, writeRefusal } from "@/lib/agent/fields";

const col = (type: Column["type"], extra: Partial<Column> = {}): Column =>
  ({ id: `c_${type}`, title: type[0].toUpperCase() + type.slice(1), type, ...extra }) as Column;

const status = col("status", {
  settings: { statusLabels: [{ label: "En cours", color: "" }, { label: "Bloqué", color: "" }, { label: "Fait", color: "" }] },
});

const ok = (column: Column, raw: unknown) => {
  const parsed = parseFieldValue(column, raw);
  if (parsed.kind !== "value") throw new Error("expected a value");
  return parsed.value;
};
const refused = (column: Column, raw: unknown) => expect(() => parseFieldValue(column, raw)).toThrow(FieldError);

describe("parseFieldValue", () => {
  it("status: the board's label, or a meaning mapped onto it", () => {
    expect(ok(status, "fait")).toBe("Fait");
    expect(ok(status, "done")).toBe("Fait");
    refused(status, "banana");
  });

  it("priority: one of the column's options", () => {
    expect(ok(col("priority"), "high")).toMatch(/high/i);
    refused(col("priority"), "whenever");
  });

  it("numbers and text", () => {
    expect(ok(col("numbers"), "12.5")).toBe(12.5);
    refused(col("numbers"), "twelve");
    expect(ok(col("text"), "Floor tiles")).toBe("Floor tiles");
    refused(col("text"), 4);
  });

  it("date and timeline: YYYY-MM-DD, a reversed range put right", () => {
    expect(ok(col("date"), "2026-10-09")).toBe("2026-10-09");
    refused(col("date"), "next Friday");
    refused(col("date"), "2026-02-31");
    expect(ok(col("timeline"), { start: "2026-10-12", end: "2026-10-10" })).toEqual({ start: "2026-10-10", end: "2026-10-12" });
    expect(ok(col("timeline"), { end: "2026-10-10" })).toEqual({ start: "2026-10-10", end: "2026-10-10" });
    refused(col("timeline"), "2026-10-10");
  });

  it("checkbox, rating, tags, link", () => {
    expect(ok(col("checkbox"), "true")).toBe(true);
    expect(ok(col("checkbox"), null)).toBe(false);
    expect(ok(col("rating", { settings: { ratingMax: 3 } }), 3)).toBe(3);
    refused(col("rating", { settings: { ratingMax: 3 } }), 4);
    expect(ok(col("tags"), "urgent, plumbing, urgent")).toEqual(["urgent", "plumbing"]);
    expect(ok(col("link"), "https://example.com")).toEqual({ url: "https://example.com" });
    refused(col("link"), "javascript:alert(1)");
  });

  it("people are handed back for the caller to resolve", () => {
    expect(parseFieldValue(col("people"), "Salma")).toEqual({ kind: "people", wanted: ["Salma"] });
    expect(parseFieldValue(col("people"), ["me", "Youssef"])).toEqual({ kind: "people", wanted: ["me", "Youssef"] });
  });

  it("null clears a field", () => {
    expect(ok(col("text"), null)).toBeNull();
    expect(ok(status, null)).toBeNull();
  });

  it("refuses the types an assistant may not write", () => {
    for (const type of ["formula", "files", "dependency", "relation"] as const) {
      expect(writeRefusal(col(type))).not.toBeNull();
      refused(col(type), "x");
    }
  });
});

describe("findColumn", () => {
  const columns = [status, col("date"), { ...col("text"), id: "t1", title: "Notes" }, { ...col("text"), id: "t2", title: "Notes" }];

  it("finds by id, or by a unique title ignoring case and accents", () => {
    expect(findColumn(columns, "c_date").id).toBe("c_date");
    expect(findColumn(columns, "STATUS").id).toBe("c_status");
  });

  it("asks for the id when two columns share a title", () => {
    expect(() => findColumn(columns, "Notes")).toThrow(/Use the column id/);
  });

  it("lists the columns when the key matches none", () => {
    try {
      findColumn(columns, "Budget");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as FieldError).options).toContain("Notes (t1)");
    }
  });
});

describe("describeColumn", () => {
  it("gives options, the expected format and whether it can be written", () => {
    expect(describeColumn(status)).toMatchObject({ writable: true, options: ["En cours", "Bloqué", "Fait"] });
    expect(describeColumn(col("formula"))).toMatchObject({ writable: false });
    expect(describeColumn(col("date")).format).toBe("YYYY-MM-DD");
  });
});

describe("readFieldValue", () => {
  it("names the people", () => {
    expect(readFieldValue(col("people"), ["u1", "u9"], new Map([["u1", "Yasser"]]))).toEqual([
      { id: "u1", name: "Yasser" },
      { id: "u9", name: "Unknown" },
    ]);
  });

  it("reads an empty cell as null", () => {
    expect(readFieldValue(col("text"), "", new Map())).toBeNull();
  });
});
