import { describe, it, expect } from "vitest";
import { commentHtml } from "@/lib/agent/edits";

describe("commentHtml", () => {
  it("writes the editor's HTML: one paragraph per line, blank lines dropped", () => {
    expect(commentHtml("Plumber booked\n\n  Friday 9am ")).toBe("<p>Plumber booked</p><p>Friday 9am</p>");
  });

  it("escapes what it is given, so a comment cannot inject markup", () => {
    // Quotes are left as they are: inside a text node they cannot open anything.
    expect(commentHtml('<img src=x onerror="alert(1)"> & co')).toBe(
      '<p>&lt;img src=x onerror="alert(1)"&gt; &amp; co</p>'
    );
  });

  it("is empty for whitespace", () => {
    expect(commentHtml("  \n ")).toBe("");
  });
});
