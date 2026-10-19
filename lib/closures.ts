/**
 * Closed days: a task whose place is shut on every day it is planned for.
 *
 * A task tagged "banque" planned for a Saturday is a wasted trip. A place (see
 * the `places` table) says which tags it answers to, which weekdays it is shut
 * and whether it closes on public holidays. This module answers, for a task's
 * tags and timeline, whether any day of it is workable - and if not, why, and
 * the nearest timeline that is.
 *
 * It only ever warns. A range with one open day in it is fine: Friday to Monday
 * for the bank means "go Friday or Monday", not a mistake. Pure.
 */

import type { Board, Column, Item, Place, PublicHoliday } from "@/types";
import { addDaysOnly, parseDateOnly, toDateOnly } from "@/lib/gantt/dates";
import { itemIsDone } from "@/lib/statusSemantics";

export interface Closures {
  places: Place[];
  holidays: PublicHoliday[];
}

export const NO_CLOSURES: Closures = { places: [], holidays: [] };

export type ClosedReason =
  | { place: Place; kind: "weekday"; weekday: number }
  | { place: Place; kind: "holiday"; holiday: PublicHoliday };

/** "#Banque ", "banque" and "BANQUÉ" are one tag. */
export function normalizeTag(tag: string): string {
  return tag
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every tag on the item, across all of the board's tags columns. */
export function tagsOf(item: Pick<Item, "column_values">, columns: Column[]): string[] {
  const tags: string[] = [];
  for (const col of columns) {
    if (col.type !== "tags") continue;
    const value = item.column_values?.[col.id];
    if (Array.isArray(value)) for (const tag of value) if (typeof tag === "string") tags.push(tag);
  }
  return tags;
}

/** The places the tags point at, in the places' own order. */
export function placesForTags(tags: string[], places: Place[]): Place[] {
  if (tags.length === 0 || places.length === 0) return [];
  const wanted = new Set(tags.map(normalizeTag).filter(Boolean));
  return places.filter((p) => p.tags.some((t) => wanted.has(normalizeTag(t))));
}

/** The holiday on this day, if any. One without a year falls on it every year. */
export function holidayOn(date: Date, holidays: PublicHoliday[]): PublicHoliday | null {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return holidays.find((h) => h.month === m && h.day === d && (h.year == null || h.year === y)) ?? null;
}

/**
 * Why each of these places is shut on this day; empty when all are open. A
 * weekday closure is given before a holiday, since it is the rule people know.
 */
export function closedReasonsOn(date: Date, places: Place[], holidays: PublicHoliday[]): ClosedReason[] {
  if (places.length === 0) return [];
  const weekday = date.getDay();
  const holiday = holidayOn(date, holidays);
  const reasons: ClosedReason[] = [];
  for (const place of places) {
    if (place.closed_weekdays.includes(weekday)) reasons.push({ place, kind: "weekday", weekday });
    else if (holiday && place.closed_on_holidays) reasons.push({ place, kind: "holiday", holiday });
  }
  return reasons;
}

/** A task at several places can only go on a day all of them are open. */
export function isClosedOn(date: Date, places: Place[], holidays: PublicHoliday[]): boolean {
  return closedReasonsOn(date, places, holidays).length > 0;
}

/**
 * Past this, a range is long enough that "every day is closed" can only come
 * from a place shut all week, and walking it would cost more than it tells.
 */
const MAX_RANGE_DAYS = 62;
/** How far ahead to look for an open day before giving up. */
const MAX_LOOKAHEAD_DAYS = 62;

export interface TimelineClosure {
  /** The first day of the range: the one the message names. */
  day: Date;
  /** Why that day is shut. */
  reasons: ClosedReason[];
  /** The same length of timeline moved to start on the next open day, if there is one. */
  fix: { start: Date; end: Date } | null;
}

/** Null when at least one day of [start, end] is open for every place. */
export function checkRange(
  start: Date,
  end: Date,
  places: Place[],
  holidays: PublicHoliday[]
): TimelineClosure | null {
  if (places.length === 0) return null;
  const from = end < start ? end : start;
  const to = end < start ? start : end;

  let length = 0;
  for (let d = from; d <= to; d = addDaysOnly(d, 1)) {
    if (++length > MAX_RANGE_DAYS) return null;
    if (!isClosedOn(d, places, holidays)) return null;
  }

  let fix: TimelineClosure["fix"] = null;
  for (let k = 1; k <= MAX_LOOKAHEAD_DAYS; k++) {
    const candidate = addDaysOnly(from, k);
    if (!isClosedOn(candidate, places, holidays)) {
      fix = { start: candidate, end: addDaysOnly(candidate, length - 1) };
      break;
    }
  }
  return { day: from, reasons: closedReasonsOn(from, places, holidays), fix };
}

/** A stored timeline value as dates; a start alone is a one-day timeline. */
export function timelineDates(value: unknown): { start: Date; end: Date } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { start?: unknown; end?: unknown };
  const start = parseDateOnly(v.start);
  if (!start) return null;
  return { start, end: parseDateOnly(v.end) ?? start };
}

export interface ClosedDayWarning {
  itemId: string;
  itemName: string;
  columnId: string;
  day: Date;
  reasons: ClosedReason[];
  /** The timeline value to write for "move to the next open day". */
  fixValue: { start: string; end: string } | null;
  fixStart: Date | null;
}

function closureOf(item: Item, column: Column, places: Place[], closures: Closures) {
  const dates = timelineDates(item.column_values?.[column.id]);
  return dates ? checkRange(dates.start, dates.end, places, closures.holidays) : null;
}

/**
 * The warning to show after one cell edit, or null.
 *
 * Fires when the edit leaves a timeline on closed days only: picking those
 * dates (again, even if they were closed before - it is a fresh choice), or
 * adding a tag that makes dates already set unworkable. Finished tasks are
 * left alone; their dates are history.
 */
export function closedDayWarning(
  before: Item,
  board: Pick<Board, "columns">,
  columnId: string,
  value: unknown,
  closures: Closures
): ClosedDayWarning | null {
  if (closures.places.length === 0) return null;
  const columns = board.columns ?? [];
  const edited = columns.find((c) => c.id === columnId);
  if (!edited || (edited.type !== "timeline" && edited.type !== "tags")) return null;

  const after = { ...before, column_values: { ...before.column_values, [columnId]: value } } as Item;
  if (itemIsDone(columns, after.column_values)) return null;

  const placesAfter = placesForTags(tagsOf(after, columns), closures.places);
  if (placesAfter.length === 0) return null;

  const timelines = edited.type === "timeline" ? [edited] : columns.filter((c) => c.type === "timeline");
  const placesBefore = placesForTags(tagsOf(before, columns), closures.places);
  for (const column of timelines) {
    const closure = closureOf(after, column, placesAfter, closures);
    if (!closure) continue;
    // A tag edit that leaves an already-flagged timeline flagged says nothing new.
    if (edited.type === "tags" && closureOf(before, column, placesBefore, closures)) continue;
    const current = (after.column_values?.[column.id] ?? {}) as Record<string, unknown>;
    return {
      itemId: before.id,
      itemName: before.name,
      columnId: column.id,
      day: closure.day,
      reasons: closure.reasons,
      fixValue: closure.fix
        ? { ...current, start: toDateOnly(closure.fix.start), end: toDateOnly(closure.fix.end) }
        : null,
      fixStart: closure.fix?.start ?? null,
    };
  }
  return null;
}
