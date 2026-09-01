/**
 * Date handling for the Gantt charts.
 *
 * Every date in `column_values` is a calendar date with no time and no zone:
 * the string "2026-03-01" means March 1st, full stop. The trap is that
 * `new Date("2026-03-01")` does NOT mean that - the ES spec parses a bare
 * date-only string as UTC midnight, so anywhere west of Greenwich it renders
 * as February 28th. The mirror image is `toISOString().split("T")[0]`, which
 * converts a local Date back through UTC and can hand back the previous day.
 *
 * So the Gantt never touches either. It parses by pulling the three numbers
 * out of the string and building a *local* midnight, and it serialises by
 * reading the local fields back. A date makes the round trip unchanged in
 * every timezone, which is the only property the chart actually needs.
 */

/** A calendar date serialised as "yyyy-MM-dd". */
export type DateOnly = string;

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Parse a stored date into a local-midnight `Date`.
 *
 * Accepts the "yyyy-MM-dd" the app writes, and tolerates a full ISO timestamp
 * by taking its date part - a value that arrived from an older import or from
 * Postgres as a timestamptz still means the day it displays as.
 *
 * Returns null for anything unparseable, so callers can skip the row rather
 * than plot an Invalid Date.
 */
export function parseDateOnly(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== "string") return null;

  const match = DATE_ONLY_RE.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(year, month - 1, day);
  // Rejects "2026-02-31", which the Date constructor would roll into March.
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/** Serialise a `Date` back to "yyyy-MM-dd" using its local fields. */
export function toDateOnly(date: Date): DateOnly {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Midnight today, in the viewer's own timezone. */
export function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Add whole days.
 *
 * Built from the calendar fields rather than by adding milliseconds, so the
 * two days a year that are 23 or 25 hours long still advance by exactly one.
 */
export function addDaysOnly(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Whole calendar days from `from` to `to` - the number of midnights crossed,
 * not a duration. Negative when `to` is earlier.
 */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

/** Inclusive span: a task that starts and ends the same day lasts 1 day. */
export function durationDays(start: Date, end: Date): number {
  return daysBetween(start, end) + 1;
}

export function isSameDateOnly(a: Date, b: Date): boolean {
  return daysBetween(a, b) === 0;
}

/** Shift a stored date value - a "yyyy-MM-dd" or a timeline `{start,end}` - by whole days. */
export function shiftDateOnlyValue(value: unknown, days: number): unknown {
  if (!value || days === 0) return value ?? null;

  const shift = (s: unknown) => {
    const d = parseDateOnly(s);
    return d ? toDateOnly(addDaysOnly(d, days)) : s;
  };

  if (typeof value === "string") {
    const d = parseDateOnly(value);
    return d ? toDateOnly(addDaysOnly(d, days)) : null;
  }
  if (typeof value === "object") {
    // Copied rather than mutated, and every other key is carried across: the
    // caller writes the result back as the whole cell value.
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    if (out.start) out.start = shift(out.start);
    if (out.end) out.end = shift(out.end);
    if (out.date) out.date = shift(out.date);
    return out;
  }
  return null;
}

/** The start date carried by a date string or a timeline `{start}` / `{date}` object. */
export function startDateOf(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "string") return parseDateOnly(value);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return parseDateOnly(o.start ?? o.date);
  }
  return null;
}

/**
 * A fixed origin for scheduling arithmetic.
 *
 * The critical path is computed in whole-day integers. Measuring those from the
 * chart's own start would tie the result to the zoom level, since the chart pads
 * its range differently at each one - and shifting every task by a constant
 * cannot change anyone's float, so the origin may as well be fixed.
 */
export const GANTT_EPOCH = new Date(2000, 0, 1);

/** Whole days from the fixed epoch - the unit the scheduler works in. */
export function dayIndex(date: Date): number {
  return daysBetween(GANTT_EPOCH, date);
}
