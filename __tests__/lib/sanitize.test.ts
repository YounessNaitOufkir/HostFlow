import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeHtml, safeExternalUrl } from "@/lib/sanitize";

describe("Input Sanitization Utilities (DOMPurify)", () => {
  describe("sanitizeText", () => {
    it("returns empty string for null or undefined", () => {
      expect(sanitizeText(null)).toBe("");
      expect(sanitizeText(undefined)).toBe("");
    });

    it("strips HTML tags from normal strings", () => {
      const input = "<b>Important</b> Workspace Name";
      const cleaned = sanitizeText(input);
      expect(cleaned).toBe("Important Workspace Name");
      expect(cleaned).not.toContain("<b>");
    });

    it("removes script tag injection attacks", () => {
      const xss = '<script>alert("XSS")</script>My Board';
      const cleaned = sanitizeText(xss);
      expect(cleaned).not.toContain("<script>");
      expect(cleaned).not.toContain("alert");
    });

    it("removes javascript: URIs", () => {
      const input = "javascript:alert(1)";
      const cleaned = sanitizeText(input);
      expect(cleaned.toLowerCase()).not.toContain("javascript:");
    });
  });

  describe("sanitizeHtml", () => {
    it("preserves safe rich-text HTML tags", () => {
      const richText =
        "<p>This is <strong>bold</strong> and <em>italic</em> text.</p>";
      const result = sanitizeHtml(richText);
      expect(result).toContain("<p>");
      expect(result).toContain("<strong>bold</strong>");
      expect(result).toContain("<em>italic</em>");
    });

    it("strips script tags from HTML content", () => {
      const maliciousHtml =
        '<p>Safe notes</p><script>fetch("http://evil.com")</script>';
      const result = sanitizeHtml(maliciousHtml);
      expect(result).toContain("<p>Safe notes</p>");
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("evil.com");
    });

    it("strips dangerous event handlers like onerror and onclick", () => {
      const input = '<a href="#" onclick="alert(document.cookie)">Click</a>';
      const result = sanitizeHtml(input);
      expect(result.toLowerCase()).not.toContain("onclick");
    });

    it("neutralizes javascript: protocol href attributes", () => {
      const input = '<a href="javascript:alert(1)">Malicious Link</a>';
      const result = sanitizeHtml(input);
      expect(result.toLowerCase()).not.toContain("javascript:");
    });
  });
});

describe("safeExternalUrl", () => {
  it("does not throw on a schemeless host, and assumes https", () => {
    // The crash: new URL("example.com") throws, and it was called during render,
    // so one link cell holding a bare host took down the whole board view.
    expect(() => safeExternalUrl("example.com")).not.toThrow();
    expect(safeExternalUrl("example.com").href).toBe("https://example.com/");
    expect(safeExternalUrl("example.com").host).toBe("example.com");
  });

  it("refuses to make a javascript: URL clickable", () => {
    // The raw value went straight into href, so this was a link a reader could
    // click. No href means the text renders without being a link.
    expect(safeExternalUrl("javascript:alert(1)").href).toBe(null);
    expect(safeExternalUrl("JaVaScRiPt:alert(1)").href).toBe(null);
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>").href).toBe(null);
  });

  it("keeps ordinary links working", () => {
    expect(safeExternalUrl("https://example.com/a?b=1").href).toBe("https://example.com/a?b=1");
    expect(safeExternalUrl("http://example.com").host).toBe("example.com");
    expect(safeExternalUrl("https://sub.example.co.uk/x").host).toBe("sub.example.co.uk");
  });

  it("allows mailto and shows the address", () => {
    expect(safeExternalUrl("mailto:a@example.com").href).toBe("mailto:a@example.com");
    expect(safeExternalUrl("mailto:a@example.com").host).toBe("a@example.com");
  });

  it("shows unparseable text without linking it", () => {
    expect(safeExternalUrl("just some words").href).toBe(null);
    expect(safeExternalUrl("just some words").host).toBe("just some words");
    expect(safeExternalUrl("").href).toBe(null);
    expect(safeExternalUrl(null).href).toBe(null);
    expect(safeExternalUrl(undefined).href).toBe(null);
  });
});
