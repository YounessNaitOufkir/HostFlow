import { describe, it, expect, afterEach } from "vitest";
import {
  parseDateOnly,
  toDateOnly,
  addDaysOnly,
  daysBetween,
  durationDays,
  isSameDateOnly,
  shiftDateOnlyValue,
  startDateOf,
} from "@/lib/gantt/dates";

const ORIGINAL_TZ = process.env.TZ;

/** Node re-reads process.env.TZ for each new Date, so a zone can be swapped mid-suite. */
function inZone(tz: string, fn: () => void) {
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    process.env.TZ = ORIGINAL_TZ;
  }
}

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe("parseDateOnly", () => {
  it("reads the day that was written, west and east of UTC", () => {
    // The bug this exists to prevent: `new Date("2026-03-01")` is UTC midnight,
    // which in Los Angeles is 4pm on February 28th.
    inZone("America/Los_Angeles", () => {
      expect(new Date("2026-03-01").getDate()).toBe(28);
      expect(parseDateOnly("2026-03-01")!.getDate()).toBe(1);
      expect(parseDateOnly("2026-03-01")!.getMonth()).toBe(2);
    });

    inZone("Asia/Tokyo", () => {
      expect(parseDateOnly("2026-03-01")!.getDate()).toBe(1);
      expect(parseDateOnly("2026-03-01")!.getMonth()).toBe(2);
    });
  });

  it("round-trips through toDateOnly unchanged in every zone", () => {
    for (const tz of ["America/Los_Angeles", "Asia/Tokyo", "UTC", "Europe/Paris"]) {
      inZone(tz, () => {
        for (const iso of ["2026-01-01", "2026-03-01", "2026-06-15", "2026-12-31"]) {
          expect(toDateOnly(parseDateOnly(iso)!)).toBe(iso);
        }
      });
    }
  });

  it("takes the date part of a full timestamp", () => {
    expect(toDateOnly(parseDateOnly("2026-03-01T00:00:00.000Z")!)).toBe("2026-03-01");
  });

  it("returns null rather than an Invalid Date", () => {
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
    expect(parseDateOnly("not a date")).toBeNull();
    expect(parseDateOnly({ start: "2026-01-01" })).toBeNull();
  });

  it("rejects a day that does not exist instead of rolling it forward", () => {
    // `new Date(2026, 1, 31)` silently becomes March 3rd.
    expect(parseDateOnly("2026-02-31")).toBeNull();
    expect(parseDateOnly("2026-13-01")).toBeNull();
  });
});

describe("addDaysOnly", () => {
  it("advances exactly one day across a spring-forward boundary", () => {
    // 2026-03-08 is the 23-hour day in US zones; adding 86400000ms lands at 11pm
    // on the 8th, and formatting that back gives the wrong date.
    inZone("America/Los_Angeles", () => {
      const d = parseDateOnly("2026-03-07")!;
      expect(toDateOnly(addDaysOnly(d, 1))).toBe("2026-03-08");
      expect(toDateOnly(addDaysOnly(d, 2))).toBe("2026-03-09");
      expect(addDaysOnly(d, 1).getHours()).toBe(0);
    });
  });

  it("advances exactly one day across a fall-back boundary", () => {
    inZone("America/Los_Angeles", () => {
      const d = parseDateOnly("2026-10-31")!;
      expect(toDateOnly(addDaysOnly(d, 1))).toBe("2026-11-01");
      expect(toDateOnly(addDaysOnly(d, 2))).toBe("2026-11-02");
    });
  });

  it("goes backwards and across month and year ends", () => {
    expect(toDateOnly(addDaysOnly(parseDateOnly("2026-03-01")!, -1))).toBe("2026-02-28");
    expect(toDateOnly(addDaysOnly(parseDateOnly("2026-01-01")!, -1))).toBe("2025-12-31");
    expect(toDateOnly(addDaysOnly(parseDateOnly("2024-02-28")!, 1))).toBe("2024-02-29");
  });
});

describe("daysBetween / durationDays", () => {
  it("counts midnights crossed, not elapsed hours", () => {
    inZone("America/Los_Angeles", () => {
      expect(daysBetween(parseDateOnly("2026-03-07")!, parseDateOnly("2026-03-09")!)).toBe(2);
    });
    expect(daysBetween(parseDateOnly("2026-01-01")!, parseDateOnly("2026-01-01")!)).toBe(0);
    expect(daysBetween(parseDateOnly("2026-01-10")!, parseDateOnly("2026-01-01")!)).toBe(-9);
  });

  it("treats a same-day task as lasting one day", () => {
    const d = parseDateOnly("2026-05-04")!;
    expect(durationDays(d, d)).toBe(1);
    expect(durationDays(d, parseDateOnly("2026-05-08")!)).toBe(5);
  });

  it("isSameDateOnly ignores any time component", () => {
    expect(isSameDateOnly(new Date(2026, 4, 4, 9, 30), new Date(2026, 4, 4, 23, 59))).toBe(true);
    expect(isSameDateOnly(new Date(2026, 4, 4), new Date(2026, 4, 5))).toBe(false);
  });
});

describe("shiftDateOnlyValue", () => {
  it("shifts a bare date string", () => {
    expect(shiftDateOnlyValue("2026-03-01", 5)).toBe("2026-03-06");
    expect(shiftDateOnlyValue("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("shifts both ends of a timeline and preserves its other keys", () => {
    expect(
      shiftDateOnlyValue({ start: "2026-03-01", end: "2026-03-10", note: "keep" }, 3)
    ).toEqual({ start: "2026-03-04", end: "2026-03-13", note: "keep" });
  });

  it("is a no-op for a zero shift and for empty values", () => {
    expect(shiftDateOnlyValue("2026-03-01", 0)).toBe("2026-03-01");
    expect(shiftDateOnlyValue(null, 3)).toBeNull();
  });

  it("survives the same DST boundary addDaysOnly does", () => {
    inZone("America/Los_Angeles", () => {
      expect(shiftDateOnlyValue({ start: "2026-03-07", end: "2026-03-07" }, 1)).toEqual({
        start: "2026-03-08",
        end: "2026-03-08",
      });
    });
  });
});

describe("startDateOf", () => {
  it("reads a string, a timeline and a legacy {date} shape", () => {
    expect(toDateOnly(startDateOf("2026-03-01")!)).toBe("2026-03-01");
    expect(toDateOnly(startDateOf({ start: "2026-03-01", end: "2026-03-09" })!)).toBe("2026-03-01");
    expect(toDateOnly(startDateOf({ date: "2026-03-01" })!)).toBe("2026-03-01");
    expect(startDateOf(null)).toBeNull();
    expect(startDateOf({ end: "2026-03-09" })).toBeNull();
  });
});
