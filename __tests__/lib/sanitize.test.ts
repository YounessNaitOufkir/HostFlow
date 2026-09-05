import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeHtml } from "@/lib/sanitize";

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
