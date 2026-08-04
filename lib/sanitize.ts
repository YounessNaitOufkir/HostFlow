import DOMPurify from "dompurify";

/**
 * Strips all HTML tags and scripts from a user-provided string.
 * Safe for item names, board names, group titles, and comments.
 */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return "";

  let cleaned = input;
  if (typeof window !== "undefined" && DOMPurify.isSupported) {
    cleaned = DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  } else {
    cleaned = input.replace(/<[^>]*>?/gm, "");
  }

  return cleaned.replace(/javascript:/gi, "").trim();
}

/**
 * Sanitizes rich-text HTML content while allowing safe formatting tags.
 * Strips XSS vectors such as <script>, onerror attributes, and javascript: links.
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";

  if (typeof window !== "undefined" && DOMPurify.isSupported) {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "u",
        "s",
        "ul",
        "ol",
        "li",
        "a",
        "code",
        "blockquote",
        "h1",
        "h2",
        "h3",
      ],
      ALLOWED_ATTR: ["href", "target", "rel"],
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
    });
  }

  // SSR / Node fallback: strip script tags and event handlers
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\bon\w+=\s*(?:['"][^'"]*['"]|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}
