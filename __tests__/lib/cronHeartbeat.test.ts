import { describe, it, expect } from "vitest";
import { assessJobs, CRON_MAX_SILENCE_HOURS } from "@/lib/cronHeartbeat";

const NOW = new Date("2026-09-04T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const limits = { "daily-digest": 26, automations: 26 };

describe("assessJobs", () => {
  it("is content with a job that ran this morning", () => {
    const health = assessJobs(
      [
        { job: "daily-digest", started_at: hoursAgo(3), ok: true },
        { job: "automations", started_at: hoursAgo(3), ok: true },
      ],
      NOW,
      limits
    );
    expect(health.every((h) => !h.stale && !h.failing)).toBe(true);
  });

  it("calls a job stale once it has been silent past its limit", () => {
    const health = assessJobs(
      [
        { job: "daily-digest", started_at: hoursAgo(27), ok: true },
        { job: "automations", started_at: hoursAgo(2), ok: true },
      ],
      NOW,
      limits
    );
    expect(health.find((h) => h.job === "daily-digest")?.stale).toBe(true);
    expect(health.find((h) => h.job === "automations")?.stale).toBe(false);
  });

  it("does not cry wolf on an ordinary late run", () => {
    // Daily at 09:00 means a gap of just over 24h is routine.
    const health = assessJobs([{ job: "automations", started_at: hoursAgo(25), ok: true }], NOW, limits);
    expect(health.find((h) => h.job === "automations")?.stale).toBe(false);
  });

  it("separates a job that failed from a job that never ran", () => {
    const health = assessJobs(
      [{ job: "automations", started_at: hoursAgo(1), ok: false }],
      NOW,
      limits
    );
    const automations = health.find((h) => h.job === "automations");
    expect(automations?.failing).toBe(true);
    expect(automations?.stale).toBe(false);

    // Never seen at all - the case a fresh deploy or a dropped cron entry
    // produces, and the one an "only alert on errors" design misses entirely.
    const digest = health.find((h) => h.job === "daily-digest");
    expect(digest?.stale).toBe(true);
    expect(digest?.lastRunAt).toBeNull();
  });

  it("judges by the newest run, whatever order the rows arrive in", () => {
    const health = assessJobs(
      [
        { job: "automations", started_at: hoursAgo(40), ok: false },
        { job: "automations", started_at: hoursAgo(2), ok: true },
        { job: "automations", started_at: hoursAgo(90), ok: true },
      ],
      NOW,
      limits
    );
    const automations = health.find((h) => h.job === "automations");
    expect(automations?.stale).toBe(false);
    expect(automations?.failing).toBe(false);
    expect(automations?.hoursSince).toBe(2);
  });

  it("reports on every job it is asked about, not just the ones with rows", () => {
    expect(assessJobs([], NOW, limits).map((h) => h.job).sort()).toEqual(
      Object.keys(limits).sort()
    );
  });

  it("watches both scheduled jobs by default", () => {
    expect(Object.keys(CRON_MAX_SILENCE_HOURS).sort()).toEqual(["automations", "daily-digest"]);
  });
});

describe("a run that starts and never finishes", () => {
  const HOUR = 3_600_000;
  const now = new Date("2026-09-05T12:00:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * HOUR).toISOString();

  it("reports a job that fails every day, rather than calling it healthy", () => {
    // The regression: the cron routes returned 500 on a fetch error without
    // closing the run, leaving ok null. `failing` only tested ok === false, and
    // `stale` only tested age - so a job failing on EVERY run opened a fresh row
    // daily and looked permanently healthy to the watchdog, to Sentry and to the
    // owner alert.
    const [health] = assessJobs(
      [{ job: "automations", started_at: ago(3), ok: null }],
      now,
      { automations: 26 }
    );
    expect(health.stale).toBe(false);
    expect(health.failing).toBe(true);
  });

  it("leaves a run that is genuinely in flight alone", () => {
    const [health] = assessJobs(
      [{ job: "automations", started_at: ago(0.05), ok: null }],
      now,
      { automations: 26 }
    );
    expect(health.failing).toBe(false);
  });

  it("still reports an ordinary completed run as healthy", () => {
    const [health] = assessJobs(
      [{ job: "automations", started_at: ago(3), ok: true }],
      now,
      { automations: 26 }
    );
    expect(health.stale).toBe(false);
    expect(health.failing).toBe(false);
  });
});
