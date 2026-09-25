import { describe, it, expect } from "vitest";
import { formatColumnNumber, BUDGET_COLUMN_SETTINGS } from "@/lib/numberFormat";

describe("formatColumnNumber", () => {
  const budget = { settings: { ...BUDGET_COLUMN_SETTINGS } };

  it("suffixes dirhams in both languages", () => {
    expect(formatColumnNumber(12500, budget, "en-US")).toBe("12,500 MAD");
    expect(formatColumnNumber(12500.5, budget, "fr-FR").replace(/\s/g, " ")).toBe("12 500,5 MAD");
  });

  it("leaves plain number columns alone", () => {
    expect(formatColumnNumber(1234, {}, "en-US")).toBe("1,234");
  });
});
