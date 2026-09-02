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
export const DONE_STATUS_PATTERN = /done|terminé|termine|achevée|achevee|completed|fait/i;

/**
 * Blocked, and in progress. Same reasoning as DONE_STATUS_PATTERN: a board says
 * "Bloqué" or "En cours" and a tile counting the English word finds nothing.
 * Deliberately narrow - "en attente" (waiting) is not the same as stuck.
 */
export const STUCK_STATUS_PATTERN = /stuck|blocked|bloqu/i;
export const WORKING_STATUS_PATTERN = /working|in progress|en cours|démarr|demarr/i;

/** True when this status value means the work is blocked. */
export function isStuckStatusValue(value: unknown): boolean {
  return typeof value === "string" && STUCK_STATUS_PATTERN.test(value);
}

/** True when this status value means the work is under way. */
export function isWorkingStatusValue(value: unknown): boolean {
  return typeof value === "string" && WORKING_STATUS_PATTERN.test(value);
}

/** True when this status value means the work is finished. */
export function isDoneStatusValue(value: unknown): boolean {
  return typeof value === "string" && DONE_STATUS_PATTERN.test(value);
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
