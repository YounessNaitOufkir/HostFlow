import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/server";
import { assessJobs, CRON_MAX_SILENCE_HOURS } from "@/lib/cronHeartbeat";
import { notifyUsersViaTelegram } from "@/app/actions/telegram-notifications";

/**
 * Notices when a scheduled job has stopped running.
 *
 * Two ways in, on purpose:
 *
 *   · on its own schedule, an hour after the daily jobs, where it reports to
 *     Sentry and messages the platform owner on Telegram;
 *   · as a plain GET with no secret, answering 200 when everything is current
 *     and 503 when it is not, so an external uptime monitor can watch it.
 *
 * The second matters more than it looks. A watchdog that is itself a cron
 * cannot report that crons have stopped firing - it would have stopped too.
 * Point any uptime checker at this URL and that hole closes: the monitor lives
 * outside the platform being monitored, which is the only place a watchdog can
 * usefully live.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const invokedByCron =
      !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

    const db = createAdminClient();
    // One row per job is all that is needed, but the newest few are cheap and
    // make the endpoint useful to read by hand when something looks wrong.
    const { data, error } = await db
      .from("cron_runs")
      .select("job, started_at, ok")
      .order("started_at", { ascending: false })
      .limit(50);

    if (error) {
      // Being unable to READ the history is itself an outage worth shouting
      // about: from here on nothing can tell whether the jobs are running.
      Sentry.captureException(new Error(`cron watchdog cannot read history: ${error.message}`));
      return NextResponse.json({ status: "unknown", error: error.message }, { status: 503 });
    }

    const health = assessJobs(data ?? []);
    const broken = health.filter((h) => h.stale || h.failing);

    if (broken.length && invokedByCron) {
      for (const h of broken) {
        const what = h.stale
          ? h.lastRunAt
            ? `has not run for ${h.hoursSince}h (limit ${CRON_MAX_SILENCE_HOURS[h.job]}h)`
            : "has never run"
          : "last run failed";
        Sentry.captureMessage(`Scheduled job "${h.job}" ${what}`, "error");
      }

      // Sentry is where the detail goes; this is so a human hears about it
      // today rather than at the next time somebody opens the dashboard.
      const owner = await db
        .from("profiles")
        .select("id")
        .eq("is_owner", true)
        .limit(1)
        .maybeSingle();
      if (owner.data?.id) {
        const lines = broken.map(
          (h) =>
            `• <b>${h.job}</b> — ${
              h.stale ? (h.lastRunAt ? `silent ${h.hoursSince}h` : "never run") : "last run failed"
            }`
        );
        await notifyUsersViaTelegram(
          [owner.data.id],
          `⚠️ <b>Scheduled work has stopped</b>\n${lines.join("\n")}`
        );
      }
    }

    return NextResponse.json(
      { status: broken.length ? "degraded" : "ok", jobs: health },
      { status: broken.length ? 503 : 200 }
    );
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
