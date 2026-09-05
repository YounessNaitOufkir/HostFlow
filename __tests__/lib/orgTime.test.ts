import { describe, it, expect } from "vitest";
import { todayInTimezone, dueDayIn, dueStateIn, cronTimeInTimezone, DEFAULT_ORG_TIMEZONE } from "@/lib/orgTime";

describe("orgTime", () => {
  describe("todayInTimezone", () => {
    it("returns an ISO date string, the shape the engine compares against", () => {
      expect(todayInTimezone("UTC", new Date("2026-08-20T12:00:00Z"))).toBe("2026-08-20");
    });

    it("is still the previous day in UTC while it is already tomorrow in Casablanca", () => {
      // 23:30 UTC on the 20th is 00:30 on the 21st in Morocco (UTC+1).
      const instant = new Date("2026-08-20T23:30:00Z");
      expect(todayInTimezone("UTC", instant)).toBe("2026-08-20");
      expect(todayInTimezone("Africa/Casablanca", instant)).toBe("2026-08-21");
    });

    it("is still the previous day in Los Angeles while UTC has rolled over", () => {
      // 00:30 UTC on the 21st is 17:30 on the 20th in California.
      const instant = new Date("2026-08-21T00:30:00Z");
      expect(todayInTimezone("UTC", instant)).toBe("2026-08-21");
      expect(todayInTimezone("America/Los_Angeles", instant)).toBe("2026-08-20");
    });

    it("falls back to UTC rather than throwing on an unknown zone", () => {
      // A bad settings value must not take the nightly cron down for every board.
      const instant = new Date("2026-08-20T12:00:00Z");
      expect(todayInTimezone("Not/AZone", instant)).toBe("2026-08-20");
    });

    it("falls back to UTC when the setting is null or empty", () => {
      const instant = new Date("2026-08-20T12:00:00Z");
      expect(todayInTimezone(null, instant)).toBe("2026-08-20");
      expect(todayInTimezone(undefined, instant)).toBe("2026-08-20");
      expect(todayInTimezone("", instant)).toBe("2026-08-20");
      expect(DEFAULT_ORG_TIMEZONE).toBe("UTC");
    });
  });

  describe("cronTimeInTimezone", () => {
    it("reports the 09:00 UTC cron as 10:00 in Casablanca", () => {
      expect(cronTimeInTimezone("Africa/Casablanca", 9)).toBe("10:00");
    });

    it("reports the cron unchanged in UTC", () => {
      expect(cronTimeInTimezone("UTC", 9)).toBe("09:00");
    });

    it("falls back to the raw UTC hour on an unknown zone", () => {
      expect(cronTimeInTimezone("Not/AZone", 9)).toBe("09:00");
    });
  });
});

describe("dueStateIn", () => {
  // The digest used to derive "today" from the server clock while the overdue
  // automation read organization_settings.default_timezone. In the hours between
  // the two midnights they classified the same task differently, and a reader
  // got a digest line the board would not confirm.
  it("calls a task due today 'today', not 'overdue', in the org's zone", () => {
    // Morocco is UTC+1, so 23:30 UTC on the 5th is already the 6th there.
    const now = new Date("2026-09-05T23:30:00Z");
    const today = todayInTimezone("Africa/Casablanca", now);
    expect(today).toBe("2026-09-06");
    // The server, on UTC, would still say the 5th - the divergence this fixes.
    expect(todayInTimezone("UTC", now)).toBe("2026-09-05");
    expect(dueStateIn("2026-09-06", today, "Africa/Casablanca")).toBe("today");
    expect(dueStateIn("2026-09-07", today, "Africa/Casablanca")).toBe("future");
    expect(dueStateIn("2026-09-05", today, "Africa/Casablanca")).toBe("overdue");
  });

  it("does not shift a stored calendar day through a timezone", () => {
    // The classic off-by-one: "2026-03-01" re-parsed as UTC midnight and read
    // back west of UTC becomes 28 Feb.
    expect(dueDayIn("2026-03-01", "America/Los_Angeles")).toBe("2026-03-01");
    expect(dueDayIn("2026-03-01", "Asia/Tokyo")).toBe("2026-03-01");
  });

  it("reads a full timestamp in the org's zone", () => {
    // 00:30 UTC on the 6th is still the 5th in Los Angeles.
    expect(dueDayIn("2026-09-06T00:30:00Z", "America/Los_Angeles")).toBe("2026-09-05");
  });

  it("reports nothing for an empty or unparseable value", () => {
    expect(dueStateIn("", "2026-09-05", "UTC")).toBe("none");
    expect(dueStateIn("not a date", "2026-09-05", "UTC")).toBe("none");
  });
});
