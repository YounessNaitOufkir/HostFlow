import type { StatusSemantic } from "@/types";

/**
 * What a status label means, independent of the automation engine.
 *
 * Its own module because two very different callers need it: the engine, and the
 * daily-digest cron. Importing the engine for a regex would drag sonner and the
 * email client into a route that wants neither.
 *
 * Boards do not agree on the word for "finished". The spreadsheet importer writes
 * each board's own labels into column.settings.statusLabels, so one board says
 * "Done" and an imported French one says "Fait". Anything deciding whether work is
 * finished must ask here rather than compare against a hardcoded string.
 */
export const DONE_STATUS_PATTERN =
  /done|terminé|termine|achevée|achevee|completed|complete|fait|finished|closed|clôturé|cloture|archivé|archivee|livré|livree|résolu|resolu|validé|validee/i;

/**
 * Blocked, and in progress. Same reasoning as DONE_STATUS_PATTERN: a board says
 * "Bloqué" or "En cours" and a tile counting the English word finds nothing.
 * Deliberately narrow - "en attente" (waiting) is not the same as stuck.
 */
export const STUCK_STATUS_PATTERN = /stuck|blocked|bloqu|on hold|impediment/i;
export const WORKING_STATUS_PATTERN =
  /working|in progress|en cours|démarr|demarr|ongoing|wip|started/i;

/**
 * Words that flip a label's meaning: "Not done" is not done.
 *
 * The patterns above match anywhere in the string, so before this existed every
 * one of "Not done", "Undone", "Non terminé", "Pas terminé" and "Never
 * completed" read as FINISHED - which meant the overdue rule skipped them, the
 * digest left them out and the dashboard counted them complete. Work that had
 * explicitly not been done was reported as done.
 *
 * A negated label is treated as carrying NO semantic rather than the opposite
 * one, because the opposite is not knowable: "not done" could be in progress or
 * stuck or untouched. That is also the safe direction to be wrong in - an item
 * wrongly thought unfinished gets a nudge, an item wrongly thought finished
 * goes quiet forever.
 */
const NEGATION_PATTERN =
  /\b(not|non|pas|never|jamais|no)\b|\b(un|in)(done|finished|complete|completed|valid|validated|blocked|resolved)\b|\bdé?bloqu/i;

/** True when the label negates whatever it would otherwise have meant. */
export function isNegatedStatusValue(value: unknown): boolean {
  return typeof value === "string" && NEGATION_PATTERN.test(value);
}

/**
 * What a status value means, preferring what the board DECLARED over what the
 * words look like.
 *
 * Pass the column's options and the guessing stops entirely. Without them - a
 * board that has never declared its semantics, or a caller that does not have
 * the column to hand - it falls back to the patterns above, which is a guess
 * and is documented as one.
 */
export function statusSemanticOf(
  value: unknown,
  options?: { label: string; semantic?: StatusSemantic }[] | null
): StatusSemantic | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();

  const declared = options?.find(
    (o) => o.label.trim().toLowerCase() === trimmed.toLowerCase()
  )?.semantic;
  if (declared) return declared;

  if (isNegatedStatusValue(trimmed)) return null;
  if (DONE_STATUS_PATTERN.test(trimmed)) return "done";
  if (STUCK_STATUS_PATTERN.test(trimmed)) return "stuck";
  if (WORKING_STATUS_PATTERN.test(trimmed)) return "working";
  return null;
}

/** True when this status value means the work is blocked. */
export function isStuckStatusValue(
  value: unknown,
  options?: { label: string; semantic?: StatusSemantic }[] | null
): boolean {
  return statusSemanticOf(value, options) === "stuck";
}

/** True when this status value means the work is under way. */
export function isWorkingStatusValue(
  value: unknown,
  options?: { label: string; semantic?: StatusSemantic }[] | null
): boolean {
  return statusSemanticOf(value, options) === "working";
}

/** True when this status value means the work is finished. */
export function isDoneStatusValue(
  value: unknown,
  options?: { label: string; semantic?: StatusSemantic }[] | null
): boolean {
  return statusSemanticOf(value, options) === "done";
}

/**
 * The status an item is in: the first status column that actually holds a value.
 * Mirrors the engine, so the digest and the overdue rule agree about an item.
 */
export function firstStatusValue(
  columns: { id: string; type: string }[],
  columnValues: Record<string, unknown> | null | undefined
): string | null {
  const values = columnValues || {};
  for (const col of columns) {
    if (col.type !== "status") continue;
    const raw = values[col.id];
    if (typeof raw === "string" && raw.trim() !== "") return raw;
  }
  return null;
}
