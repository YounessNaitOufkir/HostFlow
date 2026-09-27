import { describe, it, expect } from "vitest";
import { PERSON_PALETTE, automaticColor, chosenColor, personColor } from "@/lib/personColor";

describe("person colour", () => {
  it("uses the colour an administrator chose", () => {
    expect(personColor({ id: "u1", color: "#7C3AED" })).toBe("#7c3aed");
  });

  it("treats the default every account was created with as unchosen", () => {
    expect(chosenColor("#579bfc")).toBeNull();
    expect(personColor({ id: "u1", color: "#579bfc" })).toBe(automaticColor("u1"));
  });

  it("ignores a missing or malformed colour", () => {
    expect(chosenColor(null)).toBeNull();
    expect(chosenColor("red")).toBeNull();
    expect(chosenColor("bg-[#fdab3d]")).toBeNull();
  });

  it("gives each account a stable automatic colour from the palette", () => {
    expect(automaticColor("abc")).toBe(automaticColor("abc"));
    expect(PERSON_PALETTE).toContain(automaticColor("abc"));
    // Spread across the palette, not all the same.
    const ids = Array.from({ length: 40 }, (_, i) => `user-${i}`);
    expect(new Set(ids.map(automaticColor)).size).toBeGreaterThan(5);
  });
});
