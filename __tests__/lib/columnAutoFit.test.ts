import { describe, it, expect } from "vitest";
import { enUS } from "date-fns/locale";
import { fitColumnWidth, fitNameWidth, MAX_COLUMN_WIDTH, MIN_NAME_WIDTH, type FitEnv } from "@/lib/columnAutoFit";
import type { Column, Item, Profile } from "@/types";

// 7px per character at any size keeps the arithmetic readable.
const env: FitEnv = {
  measure: (text) => text.length * 7,
  locale: enUS,
  bcp47: "en-US",
  statusLabel: (l) => l,
  priorityLabel: (l) => l,
  profiles: [{ id: "u1" }, { id: "u2" }] as Profile[],
};

const item = (values: Record<string, unknown>, name = "Task"): Item =>
  ({ id: name, name, board_id: "b", group_id: "g", position: 0, column_values: values }) as Item;

describe("fitColumnWidth", () => {
  const text: Column = { id: "c", title: "Notes", type: "text" };

  it("fits the longest value, however many rows there are", () => {
    const items = [item({ c: "short" }), item({ c: "a much longer note here" }), item({ c: "mid" })];
    expect(fitColumnWidth(text, "Notes", items, env)).toBe(23 * 7 + 20);
  });

  it("never goes narrower than the header needs", () => {
    expect(fitColumnWidth(text, "Notes", [item({ c: "x" })], env)).toBe(5 * 7 + 56);
  });

  it("caps a runaway value", () => {
    expect(fitColumnWidth(text, "Notes", [item({ c: "y".repeat(500) })], env)).toBe(MAX_COLUMN_WIDTH);
  });

  it("fits budget amounts with their currency", () => {
    const budget: Column = { id: "b", title: "Budget", type: "numbers", settings: { numberFormat: "currency", currencySymbol: "MAD" } };
    // "1,234,567 MAD" is 13 characters
    expect(fitColumnWidth(budget, "Budget", [item({ b: "1234567" })], env)).toBe(13 * 7 + 20);
  });

  it("counts deleted assignees as the '?' badge", () => {
    const people: Column = { id: "p", title: "Owner", type: "people" };
    // header 5*7+56 = 91; two known avatars + one unknown badge = 28 + 2*20 + 16 = 84
    expect(fitColumnWidth(people, "Owner", [item({ p: ["u1", "u2", "gone"] })], env)).toBe(91);
  });
});

describe("fitNameWidth", () => {
  it("fits the longest task name and respects the minimum", () => {
    expect(fitNameWidth("Item", [item({}, "Hi")], env)).toBe(MIN_NAME_WIDTH);
    const long = "Installer la cuisine et les placards";
    expect(fitNameWidth("Item", [item({}, long)], env)).toBe(long.length * 7 + 54);
  });
});
