import { describe, it, expect } from "vitest";
import {
  attachmentPathFor,
  attachmentPathOf,
  attachmentPathsIn,
  toStoredAttachmentHtml,
  withSignedAttachmentUrls,
  attachmentDisplayName,
  isImageAttachment,
} from "@/lib/attachments";
import { sanitizeHtml } from "@/lib/sanitize";

// The configured project (vitest.setup.ts), since only its storage counts as "own".
const ORIGIN = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const stored = (path: string) => `${ORIGIN}/storage/v1/object/public/attachments/${path}`;
const signed = (path: string) => `${ORIGIN}/storage/v1/object/sign/attachments/${path}?token=eyJ.abc.def`;

describe("attachment paths", () => {
  it("puts uploads in the board's folder with a safe, readable name", () => {
    expect(attachmentPathFor("board-1", "Devis Host'lik été.pdf", "id-1")).toBe("boards/board-1/id-1-Devis_Host_lik_ete.pdf");
  });

  it("reads the path from both the stored and the signed form", () => {
    expect(attachmentPathOf(stored("boards/b/x.png"))).toBe("boards/b/x.png");
    expect(attachmentPathOf(signed("boards/b/x.png"))).toBe("boards/b/x.png");
    expect(attachmentPathOf(stored("boards/b/a%20b.pdf"))).toBe("boards/b/a b.pdf");
    expect(attachmentPathOf("https://example.com/x.png")).toBeNull();
  });

  it("finds every attachment in an update", () => {
    const html = `<p><img src="${stored("boards/b/1.png")}"></p><p><a href="${signed("boards/b/2.pdf")}">📄 2.pdf</a></p>`;
    expect(attachmentPathsIn(html)).toEqual(["boards/b/1.png", "boards/b/2.pdf"]);
  });
});

describe("saving and showing", () => {
  it("saves signed links back as the stable form, so they do not expire", () => {
    const html = `<img src="${signed("boards/b/1.png").replace("&", "&amp;")}">`;
    const out = toStoredAttachmentHtml(html);
    expect(out).not.toContain("token=");
    expect(attachmentPathOf(out)).toBe("boards/b/1.png");
  });

  it("swaps stored links for signed ones when shown, leaving unknown ones alone", () => {
    const html = `<img src="${stored("boards/b/1.png")}"><img src="${stored("boards/b/2.png")}">`;
    const out = withSignedAttachmentUrls(html, { "boards/b/1.png": signed("boards/b/1.png") });
    expect(out).toContain(signed("boards/b/1.png"));
    expect(out).toContain(stored("boards/b/2.png"));
  });

  it("names files without the folder or upload prefix", () => {
    expect(attachmentDisplayName("boards/b/0f8fad5b-d9cb-469f-a165-70867728950e-Devis.pdf")).toBe("Devis.pdf");
    expect(attachmentDisplayName("97b8b888-893a-4ed6-a519-d37919863777-1782486827353-Devis Host'lik.pdf")).toBe("Devis Host'lik.pdf");
    expect(isImageAttachment("boards/b/photo.JPG")).toBe(true);
    expect(isImageAttachment("boards/b/doc.pdf")).toBe(false);
  });
});

describe("pictures in updates", () => {
  it("keeps a picture from this app's storage", () => {
    const out = sanitizeHtml(`<p><img src="${signed("boards/b/1.png")}" alt="x"></p>`);
    expect(out).toContain("<img");
  });

  it("drops a picture from anywhere else, and anything risky on it", () => {
    expect(sanitizeHtml(`<img src="https://tracker.example/p.gif">`)).not.toContain("<img");
    expect(sanitizeHtml(`<img src="${signed("boards/b/1.png")}" onerror="alert(1)">`)).not.toContain("onerror");
  });
});

describe("repeated use", () => {
  it("finds the first attachment even after another URL was just read", () => {
    // Regression: a shared /g regex kept its position between calls, so the
    // scan after a read started late and missed the update's picture.
    attachmentPathOf(signed("boards/b/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.pdf"));
    const html = `<img src="${stored("boards/b/1.png")}"><p><a href="${stored("boards/b/2.pdf")}">x</a></p>`;
    expect(attachmentPathsIn(html)).toEqual(["boards/b/1.png", "boards/b/2.pdf"]);
  });
});
