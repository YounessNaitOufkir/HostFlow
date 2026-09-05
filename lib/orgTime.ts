/**
 * "Today" is a business question, not a UTC one.
 *
 * The automation engine computed today as `new Date().toISOString().split("T")[0]`,
 * which is the **UTC** date regardless of where the company operates. For Host'lik
 * (Africa/Casablanca, UTC+1) that is the wrong day for the first hour of every local
 * day: between 00:00 and 01:00 local, a task due today still reads as due tomorrow,
 * so an SLA alert fires a day late and an overdue tag a day early.
 *
 * `organization_settings.default_timezone` has existed since 20260725000000 and
 * nothing has ever read it. This module is what reads it.
 */

export const DEFAULT_ORG_TIMEZONE = "UTC";

/** The UTC hour the Vercel cron fires at, from `vercel.json` ("0 9 * * *"). */
export const CRON_UTC_HOUR = 9;

function isoDateIn(timeZone: string, now: Date): string {
  // en-CA renders as YYYY-MM-DD, which is exactly the shape the engine compares
  // against — date column values are stored as ISO date strings.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The calendar date it currently is in `timeZone`, as "YYYY-MM-DD".
 *
 * An unrecognised zone falls back to UTC rather than throwing: a bad settings value
 * must not take down the nightly cron for every board.
 */
export function todayInTimezone(
  timeZone: string | null | undefined,
  now: Date = new Date()
): string {
  try {
    return isoDateIn(timeZone || DEFAULT_ORG_TIMEZONE, now);
  } catch {
    return isoDateIn(DEFAULT_ORG_TIMEZONE, now);
  }
}

/**
 * What time the daily cron lands at in `timeZone`, e.g. "10:00".
 *
 * Read-only by nature: `vercel.json` is static build configuration, so the run time
 * cannot be changed from the app. This exists so Settings can *state* when
 * automations run instead of pretending the time is editable.
 */
export function cronTimeInTimezone(
  timeZone: string | null | undefined,
  utcHour: number = CRON_UTC_HOUR
): string {
  const probe = new Date();
  probe.setUTCHours(utcHour, 0, 0, 0);
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || DEFAULT_ORG_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(probe);
  } catch {
    return `${String(utcHour).padStart(2, "0")}:00`;
  }
}

/**
 * The calendar day a stored date falls on, in `timeZone`.
 *
 * A "YYYY-MM-DD" prefix is taken as-is: it is already a calendar day, and
 * re-parsing it through Date would shift it across a midnight boundary west of
 * UTC. Anything else is parsed and then asked which day it lands on there.
 */
export function dueDayIn(
  dateString: string,
  timeZone: string | null | undefined
): string | null {
  if (!dateString) return null;
  // Only a BARE date is taken as-is. The same prefix inside a full timestamp is
  // an instant, not a calendar day, and has to be resolved in the zone -
  // "2026-09-06T00:30:00Z" is still the 5th in Los Angeles.
  const bare = dateString.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  if (bare) return bare[1];
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) return null;
  return todayInTimezone(timeZone, parsed);
}

/**
 * Whether a date is behind, on, or ahead of a given day.
 *
 * "Today" has to be the organisation's today. The overdue and SLA automations
 * read organization_settings.default_timezone; the daily digest derived its own
 * from the server clock, so in the hours between the two midnights the digest
 * and the board disagreed about the same task and a reader got a line the board
 * would not confirm. Compared as "YYYY-MM-DD" strings, which sort correctly and
 * cannot drift the way two Date objects can.
 */
export function dueStateIn(
  dateString: string,
  todayStr: string,
  timeZone: string | null | undefined
): "today" | "overdue" | "future" | "none" {
  const day = dueDayIn(dateString, timeZone);
  if (!day) return "none";
  if (day < todayStr) return "overdue";
  if (day === todayStr) return "today";
  return "future";
}
