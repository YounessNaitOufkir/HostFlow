import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/safeNext";

describe("safeNextPath", () => {
  it("keeps a path on this site, query included", () => {
    expect(safeNextPath("/oauth/consent?authorization_id=abc")).toBe("/oauth/consent?authorization_id=abc");
  });

  it("refuses anything that would leave the site", () => {
    for (const value of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "javascript:alert(1)", "/\nx"]) {
      expect(safeNextPath(value)).toBe("/");
    }
  });

  it("falls back when there is nothing", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("", "/home")).toBe("/home");
  });
});
