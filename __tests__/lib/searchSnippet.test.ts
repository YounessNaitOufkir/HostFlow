import { describe, it, expect } from "vitest";
import { stripHtml, commentSnippet } from "@/lib/searchSnippet";

describe("stripHtml", () => {
  it("keeps words apart across block boundaries", () => {
    expect(stripHtml("<p>one</p><p>two</p>")).toBe("one two");
    expect(stripHtml("<li>a</li><li>b</li>")).toBe("a b");
    expect(stripHtml("line<br>break")).toBe("line break");
  });

  it("drops markup without dropping the words inside it", () => {
    expect(stripHtml("<p>Le <b>devis</b> est <i>signé</i></p>")).toBe("Le devis est signé");
  });

  it("does not leak attribute values into the text", () => {
    expect(stripHtml('<a href="http://example.com/secret">click</a>')).toBe("click");
  });

  it("decodes the entities the editor writes", () => {
    expect(stripHtml("<p>Tom&nbsp;&amp;&nbsp;Jerry &lt;tags&gt; &quot;quoted&quot;</p>")).toBe(
      'Tom & Jerry <tags> "quoted"'
    );
  });

  it("survives an empty or tag-only body", () => {
    expect(stripHtml("")).toBe("");
    expect(stripHtml("<p></p><div></div>")).toBe("");
  });
});

describe("commentSnippet", () => {
  const long =
    "<p>" + "Bonjour, ".repeat(20) + "la facture est envoyée au client. " + "Merci. ".repeat(20) + "</p>";

  it("centres the window on the match rather than the opening", () => {
    const snippet = commentSnippet(long, "facture");
    expect(snippet).toContain("facture");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet.length).toBeLessThan(120);
  });

  it("shows the opening when the match is not a plain substring", () => {
    // Full-text matches words, so a hit can be a form the raw string lacks.
    const snippet = commentSnippet("<p>Les factures sont envoyées</p>", "facture");
    expect(snippet).toContain("Les factures");
  });

  it("does not add ellipses to a comment that already fits", () => {
    expect(commentSnippet("<p>Court message</p>", "court")).toBe("Court message");
  });

  it("never returns markup", () => {
    const snippet = commentSnippet('<p onclick="x">hello <img src="y"> world</p>', "hello");
    expect(snippet).not.toMatch(/[<>]/);
  });

  it("survives an empty body or an empty query", () => {
    expect(commentSnippet("", "anything")).toBe("");
    expect(commentSnippet("<p>Some text</p>", "")).toBe("Some text");
  });
});
