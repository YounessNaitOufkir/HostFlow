/**
 * A readable line out of a comment body.
 *
 * Comments are stored as HTML from the editor, so a result row cannot show the
 * body as-is: it would be tags, and a long one would swamp the list. This
 * strips the markup, then cuts a window around the first match so the reader
 * sees the phrase they searched for in its sentence rather than the opening
 * words of a paragraph that mentions it at the end.
 *
 * Text out, never markup. The caller renders it as a string and highlights the
 * match by splitting on it, so nothing here can put HTML back into the page.
 */

/** Characters of context to keep either side of the match. */
const CONTEXT = 42;
/** Longest snippet to return when nothing matches and we just take the opening. */
const LEAD = 110;

const BLOCK_BOUNDARY = /<\/(p|div|li|h[1-6]|blockquote|tr)>/gi;

/**
 * Markup out, entities decoded, whitespace collapsed.
 *
 * Block ends become a space first, otherwise "<p>one</p><p>two</p>" reads as
 * "onetwo". Entities are decoded by hand rather than through the DOM so this
 * also works server-side and in tests.
 */
export function stripHtml(html: string): string {
  return html
    .replace(BLOCK_BOUNDARY, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The part of a comment worth showing for this query.
 *
 * Falls back to the opening of the comment when the match is not a plain
 * substring - full-text search matches on words, so a hit can be a form the
 * raw string does not contain, and showing the start beats showing nothing.
 */
export function commentSnippet(body: string, query: string): string {
  const text = stripHtml(body ?? "");
  if (!text) return "";

  const needle = query.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;

  if (at < 0) {
    return text.length > LEAD ? `${text.slice(0, LEAD - 1)}…` : text;
  }

  const from = Math.max(0, at - CONTEXT);
  const to = Math.min(text.length, at + needle.length + CONTEXT);
  return `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`;
}
