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
