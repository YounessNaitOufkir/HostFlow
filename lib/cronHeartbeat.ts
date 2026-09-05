import { createAdminClient } from "@/lib/supabase/server";

/**
 * Leaves a trace that a scheduled job ran.
 *
 * Sentry reports what went wrong inside a run. It has nothing to say about a
 * run that never started, which is the failure that actually happens: a path
 * renamed by a deploy, an entry dropped from vercel.json, a job quietly timing
 * out. Nobody notices for weeks, and then only because someone mentions their
 * email stopped.
 *
 * So every run writes a row, and /api/cron/watchdog complains when the newest
 * one is too old. Recording is best-effort by design - a heartbeat that could
 * fail the job it monitors would be worse than no heartbeat.
 */

/** How long each job may go unseen before the watchdog calls it stale. */
export const CRON_MAX_SILENCE_HOURS: Record<string, number> = {
  // Both run daily at 09:00 UTC. 26 hours leaves room for a late start and for
  // the watchdog's own schedule without crying wolf on an ordinary day.
  "daily-digest": 26,
  automations: 26,
};

/**
 * How long a run may stay open before it is treated as having died.
 *
 * Both jobs finish in seconds, so an hour is far beyond a slow run and well
 * inside the daily cadence - a run genuinely in flight when the watchdog looks
 * is minutes old, not hours.
 */
export const ABANDONED_AFTER_HOURS = 1;

export type CronJob = keyof typeof CRON_MAX_SILENCE_HOURS | string;

/** Opens a run. Returns the row id, or null if the trace could not be written. */
export async function startCronRun(job: CronJob): Promise<string | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("cron_runs")
      .insert({ job, started_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) {
      console.warn(`[cron] could not record start of ${job}: ${error.message}`);
      return null;
    }
    return data.id;
  } catch (err) {
    console.warn(`[cron] could not record start of ${job}:`, err);
    return null;
  }
}

/**
 * Closes a run. `detail` is whatever the job counts as work - rules fired,
 * digests sent - so a run that completed but did nothing can be told apart
 * from one that never happened.
 */
export async function finishCronRun(
  id: string | null,
  ok: boolean,
  detail: Record<string, unknown> = {},
  error?: unknown
): Promise<void> {
  if (!id) return;
  try {
    const db = createAdminClient();
    await db
      .from("cron_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok,
        detail,
        error: error ? String(error instanceof Error ? error.message : error).slice(0, 2000) : null,
      })
      .eq("id", id);
  } catch (err) {
    console.warn("[cron] could not record finish:", err);
  }
}

export interface JobHealth {
  job: string;
  lastRunAt: string | null;
  hoursSince: number | null;
  lastRunOk: boolean | null;
  stale: boolean;
  /** Ran, but threw. Distinct from stale: it fired and failed. */
  failing: boolean;
}

/**
 * Judges each job from its most recent run.
 *
 * A job that has never run at all counts as stale: on a fresh deploy that is
 * true and worth saying, and it means a job whose first run never happens is
 * caught rather than excused.
 */
export function assessJobs(
  rows: { job: string; started_at: string; ok: boolean | null }[],
  now: Date = new Date(),
  limits: Record<string, number> = CRON_MAX_SILENCE_HOURS
): JobHealth[] {
  const newest = new Map<string, { started_at: string; ok: boolean | null }>();
  for (const row of rows) {
    const seen = newest.get(row.job);
    if (!seen || row.started_at > seen.started_at) newest.set(row.job, row);
  }

  return Object.keys(limits).map((job) => {
    const last = newest.get(job);
    if (!last) {
      return { job, lastRunAt: null, hoursSince: null, lastRunOk: null, stale: true, failing: false };
    }
    const hoursSince = (now.getTime() - new Date(last.started_at).getTime()) / 3_600_000;
    // An abandoned run counts as a failure, not as silence.
    //
    // ok is null between startCronRun and finishCronRun. A route that returned
    // early on an error - or a serverless instance killed mid-run - leaves the
    // row that way forever, and the next day's run opens another fresh one. So a
    // job failing EVERY day looked neither stale (it started recently) nor
    // failing (ok was null rather than false), and the watchdog reported it
    // healthy indefinitely. A run still open long after it began did not finish.
    const abandoned = last.ok === null && hoursSince > ABANDONED_AFTER_HOURS;
    return {
      job,
      lastRunAt: last.started_at,
      hoursSince: Math.round(hoursSince * 10) / 10,
      lastRunOk: last.ok,
      stale: hoursSince > limits[job],
      failing: last.ok === false || abandoned,
    };
  });
}
