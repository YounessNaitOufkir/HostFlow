/**
 * A person's colour: what paints their Gantt bars when a chart is coloured by
 * assignee, and fills their avatar when they have no photo.
 *
 * Administrators choose it (set_profile_color). Until they do, every account
 * carries the same default blue it was created with - which would make every
 * assignee on a chart look like the same person - so an unchosen colour is
 * worked out from the account id instead: stable, and spread across the
 * palette.
 */

/**
 * The colours offered. Saturated enough to read as a bar, dark enough for
 * white initials, and none of them the group default blue or the critical
 * path red, so a person is never mistaken for either.
 */
export const PERSON_PALETTE = [
  // pinks and purples
  "#db2777", // pink
  "#be185d", // raspberry
  "#9f1239", // wine
  "#c026d3", // fuchsia
  "#9333ea", // purple
  "#7c3aed", // violet
  // blues and teals
  "#4f46e5", // indigo
  "#1d4ed8", // royal blue
  "#0369a1", // ocean
  "#0891b2", // cyan
  "#0d9488", // teal
  "#047857", // emerald
  // greens and yellows
  "#00a36c", // green
  "#65a30d", // lime
  "#4d7c0f", // olive
  "#a16207", // mustard
  "#f59e0b", // amber
  "#d97706", // honey
  // oranges, browns and neutrals
  "#ea580c", // orange
  "#c2410c", // rust
  "#b45309", // brown
  "#78350f", // chocolate
  "#475569", // slate
  "#1e293b", // charcoal
] as const;

/** What every account was created with: not a choice anyone made. */
const UNCHOSEN = new Set(["#579bfc"]);
const HEX = /^#[0-9a-f]{6}$/i;

/** The colour an administrator chose, or null when none has been. */
export function chosenColor(color: string | null | undefined): string | null {
  if (!color || !HEX.test(color)) return null;
  const lower = color.toLowerCase();
  return UNCHOSEN.has(lower) ? null : lower;
}

/** The automatic colour for an account, from its id. */
export function automaticColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PERSON_PALETTE[hash % PERSON_PALETTE.length];
}

export function personColor(person: { id: string; color?: string | null }): string {
  return chosenColor(person.color) ?? automaticColor(person.id);
}
