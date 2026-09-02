import { describe, it, expect } from "vitest";
import { statusHex, statusHexOr, NEUTRAL_STATUS_COLOR } from "@/lib/statusColor";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/types";

describe("statusHex", () => {
  it("reads an arbitrary Tailwind value verbatim", () => {
    expect(statusHex("bg-[#00c875]")).toBe("#00c875");
    expect(statusHex("bg-[#e2445c] text-white")).toBe("#e2445c");
  });

  it("resolves a gradient to where it starts", () => {
    // The regression this module exists for. The built-in "Overdue" status is a
    // gradient, so Kanban's hex-only matcher found nothing and painted it the
    // same neutral grey as "no status" - on the one status that means hurry up.
    expect(statusHex("bg-gradient-to-r from-red-600 to-rose-600")).toBe("#dc2626");
  });

  it("keeps Overdue distinct from the flat red Stuck already uses", () => {
    const overdue = statusHex(STATUS_OPTIONS.find((o) => o.label === "Overdue")!.color);
    const stuck = statusHex(STATUS_OPTIONS.find((o) => o.label === "Stuck")!.color);
    expect(overdue).not.toBeNull();
    expect(overdue).not.toBe(stuck);
  });

  it("falls back to the colour family for a plain Tailwind class", () => {
    expect(statusHex("bg-green-500")).toBe("#00c875");
    expect(statusHex("bg-yellow-400")).toBe("#fdab3d");
    expect(statusHex("bg-blue-500")).toBe("#579bfc");
    expect(statusHex("bg-purple-500")).toBe("#a25ddc");
  });

  it("reads a dark neutral as near-black, not as plain grey", () => {
    // Ordering matters: the generic grey rule sits below this one, and the
    // Critical priority is bg-gray-900.
    expect(statusHex("bg-gray-900")).toBe("#111827");
    expect(statusHex("bg-black")).toBe("#111827");
    expect(statusHex("bg-gray-300")).toBe(NEUTRAL_STATUS_COLOR);
  });

  it("returns null when it genuinely cannot tell", () => {
    expect(statusHex("bg-somethingelse")).toBeNull();
    expect(statusHex("")).toBeNull();
    expect(statusHex(undefined)).toBeNull();
    expect(statusHex(null)).toBeNull();
  });
});

describe("every colour the app actually ships resolves", () => {
  it("covers STATUS_OPTIONS", () => {
    for (const opt of STATUS_OPTIONS) {
      expect(statusHex(opt.color), `${opt.label} (${opt.color})`).not.toBeNull();
    }
  });

  it("covers PRIORITY_OPTIONS", () => {
    for (const opt of PRIORITY_OPTIONS) {
      expect(statusHex(opt.color), `${opt.label} (${opt.color})`).not.toBeNull();
    }
  });

  it("gives no two statuses the same colour", () => {
    // Two labels sharing a hex is indistinguishable in a ring or a chip.
    const hexes = STATUS_OPTIONS.map((o) => statusHex(o.color));
    expect(new Set(hexes).size).toBe(hexes.length);
  });
});

describe("statusHexOr", () => {
  it("always yields something paintable", () => {
    expect(statusHexOr("bg-nonsense")).toBe(NEUTRAL_STATUS_COLOR);
    expect(statusHexOr(undefined, "#123456")).toBe("#123456");
    expect(statusHexOr("bg-[#abcdef]", "#123456")).toBe("#abcdef");
  });
});
