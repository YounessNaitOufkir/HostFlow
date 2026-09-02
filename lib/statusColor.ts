/**
 * One answer to "what colour is this label?", for every view that draws one.
 *
 * There were three, and they disagreed. Kanban matched a literal `#rrggbb` and
 * nothing else, so the built-in "Overdue" status - defined as a Tailwind
 * gradient rather than a flat colour - found no hex and fell back to neutral
 * grey, the one status a reader most needs to pick out. Calendar had a
 * colour-family fallback and got it right. The dashboard had a third rule.
 *
 * A status colour is stored as the class name the board cells render, so it can
 * be any of: an arbitrary value (`bg-[#00c875]`), a gradient
 * (`bg-gradient-to-r from-red-600 to-rose-600`), or a plain Tailwind class
 * (`bg-gray-900`). All three resolve here.
 */

/** Used when nothing else resolves - a colour, not an absence. */
export const NEUTRAL_STATUS_COLOR = "#c4c4c4";

/**
 * Exact first stops for the gradients the app ships, so "Overdue" keeps its own
 * red rather than collapsing onto the flat red that "Stuck" already uses.
 */
const GRADIENT_STOPS: Record<string, string> = {
  "red-600": "#dc2626",
  "rose-600": "#e11d48",
};

/**
 * Tailwind colour families mapped onto the app's own palette, most specific
 * first: `gray-900` must beat the generic `gray` rule below it.
 */
const FAMILIES: [RegExp, string][] = [
  [/(?:gray|grey|slate|zinc|neutral|stone)-9\d\d|black/, "#111827"],
  [/red|rose|pink/, "#e2445c"],
  [/orange|amber|yellow/, "#fdab3d"],
  [/green|emerald|lime|teal/, "#00c875"],
  [/blue|sky|cyan|indigo/, "#579bfc"],
  [/purple|violet|fuchsia/, "#a25ddc"],
  [/gray|grey|slate|zinc|neutral|stone/, NEUTRAL_STATUS_COLOR],
];

/**
 * The hex a Tailwind background class stands for, or null when nothing matches.
 *
 * Prefer `statusHexOr` at a call site that has to paint something regardless.
 */
export function statusHex(bgClass: string | null | undefined): string | null {
  if (!bgClass) return null;

  // An arbitrary value carries the colour verbatim: bg-[#00c875].
  const arbitrary = bgClass.match(/\[([^\]]+)\]/);
  if (arbitrary) return arbitrary[1];

  // A bare hex anywhere, for values stored without the bracket syntax.
  const bare = bgClass.match(/#[0-9a-fA-F]{3,8}\b/);
  if (bare) return bare[0];

  // A gradient cannot be a fill, so it resolves to where it starts.
  const from = bgClass.match(/from-([a-z]+-\d{2,3})/);
  if (from && GRADIENT_STOPS[from[1]]) return GRADIENT_STOPS[from[1]];

  for (const [pattern, hex] of FAMILIES) {
    if (pattern.test(bgClass)) return hex;
  }

  return null;
}

/** As `statusHex`, but always a colour - for a style attribute that needs one. */
export function statusHexOr(
  bgClass: string | null | undefined,
  fallback: string = NEUTRAL_STATUS_COLOR
): string {
  return statusHex(bgClass) ?? fallback;
}
