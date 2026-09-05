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

/** Schemes a stored link may actually navigate to. */
const NAVIGABLE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * A stored link, resolved into something safe to put in an href.
 *
 * Link cells keep whatever was typed: the input is `type="url"` but sits outside
 * a form, so nothing validates it. Two things went wrong with that raw value.
 * `new URL(value)` was called during render to show the hostname, and it THROWS
 * on a schemeless string like "example.com" - taking the whole board view down
 * with it. And the same value went straight into href, so "javascript:..." was a
 * link the reader could click.
 *
 * A bare host is treated as https, which is what the writer meant. Anything that
 * is not http, https or mailto returns href null - the caller shows the text
 * without making it clickable.
 */
export function safeExternalUrl(raw: unknown): { href: string | null; host: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { href: null, host: "" };

  const parse = (candidate: string): URL | null => {
    try {
      return new URL(candidate);
    } catch {
      return null;
    }
  };

  // A scheme-relative or schemeless host is assumed to be https.
  const parsed =
    parse(text) ?? (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text) ? parse(`https://${text}`) : null);

  if (!parsed || !NAVIGABLE_SCHEMES.has(parsed.protocol)) {
    return { href: null, host: text };
  }

  return {
    href: parsed.href,
    host: parsed.protocol === "mailto:" ? parsed.pathname : parsed.hostname || text,
  };
}
