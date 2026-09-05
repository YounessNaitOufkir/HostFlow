import { describe, it, expect } from "vitest";
import { cleanLabelValue } from "@/lib/importUtils";

/**
 * Monday exports status and priority values with the emoji included, which used
 * to create a duplicate label ("Critical ⚠️" alongside "Critical") that got the
 * next colour from the palette — the stray green option after an import.
 */
describe("cleanLabelValue", () => {
  it("strips a trailing warning emoji and its variation selectors", () => {
    // exactly the value found on the Lancement board: U+26A0 + two U+FE0F
    expect(cleanLabelValue("Critical ⚠️️")).toBe("Critical");
  });

  it("leaves a clean label untouched", () => {
    expect(cleanLabelValue("Critical")).toBe("Critical");
    expect(cleanLabelValue("Working on it")).toBe("Working on it");
  });

  it("preserves accented characters", () => {
    expect(cleanLabelValue("Élevée")).toBe("Élevée");
    expect(cleanLabelValue("Bloqué")).toBe("Bloqué");
  });

  it("strips leading emoji and collapses the gap", () => {
    expect(cleanLabelValue("🔥 Urgent")).toBe("Urgent");
    expect(cleanLabelValue("Done ✅")).toBe("Done");
  });

  it("makes the emoji and non-emoji forms compare equal", () => {
    const a = cleanLabelValue("Critical ⚠️").toLowerCase();
    const b = cleanLabelValue("critical").toLowerCase();
    expect(a).toBe(b);
  });

  it("handles empty and nullish input", () => {
    expect(cleanLabelValue("")).toBe("");
    expect(cleanLabelValue(null)).toBe("");
    expect(cleanLabelValue(undefined)).toBe("");
  });

  it("collapses internal whitespace left behind by a removed emoji", () => {
    expect(cleanLabelValue("High ⚠️ priority")).toBe("High priority");
  });
});
