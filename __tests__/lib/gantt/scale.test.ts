import { describe, it, expect } from "vitest";
import {
  createGanttScale,
  ganttBounds,
  GANTT_ZOOMS,
  PX_PER_DAY,
} from "@/lib/gantt/scale";
import { parseDateOnly, toDateOnly, addDaysOnly, daysBetween } from "@/lib/gantt/dates";

const d = (iso: string) => parseDateOnly(iso)!;

function scaleFor(zoom: (typeof GANTT_ZOOMS)[number], from = "2026-01-01", to = "2026-12-31") {
  return createGanttScale({ zoom, chartStart: d(from), chartEnd: d(to) });
}

describe("geometry", () => {
  it("puts the chart origin at x = 0", () => {
    for (const zoom of GANTT_ZOOMS) {
      expect(scaleFor(zoom).xOf(d("2026-01-01"))).toBe(0);
    }
  });

  it("round-trips every date through x and back, at every zoom", () => {
    for (const zoom of GANTT_ZOOMS) {
      const scale = scaleFor(zoom);
      for (let i = 0; i < scale.totalDays; i += 7) {
        const date = addDaysOnly(scale.chartStart, i);
        expect(toDateOnly(scale.dateAt(scale.xOf(date)))).toBe(toDateOnly(date));
      }
    }
  });

  it("spans exactly totalDays across the full width", () => {
    const scale = scaleFor("day");
    expect(scale.totalDays).toBe(365);
    expect(scale.width).toBe(365 * PX_PER_DAY.day);
    expect(scale.xOf(d("2026-12-31"))).toBe(364 * PX_PER_DAY.day);
  });

  it("gives a same-day task a full unit of width rather than zero", () => {
    for (const zoom of GANTT_ZOOMS) {
      const scale = scaleFor(zoom);
      expect(scale.widthOf(d("2026-05-04"), d("2026-05-04"))).toBe(scale.pxPerDay);
    }
  });

  it("measures an inclusive span", () => {
    const scale = scaleFor("day");
    // Mar 1 to Mar 5 is five days of work, so five columns wide.
    expect(scale.widthOf(d("2026-03-01"), d("2026-03-05"))).toBe(5 * PX_PER_DAY.day);
  });

  it("converts a drag distance to whole days", () => {
    const scale = scaleFor("day");
    expect(scale.daysFromPx(150)).toBe(3);
    expect(scale.daysFromPx(-100)).toBe(-2);
    // Under half a column does not move the bar.
    expect(scale.daysFromPx(20)).toBe(0);
  });

  it("keeps a bar's right edge and its successor's left edge on one number line", () => {
    // The regression that mattered: bars used percentages while the arrow layer
    // used pixels, so an arrow only landed on its bar when the track happened to
    // be exactly totalDays * 50 wide. One xOf means they cannot disagree.
    for (const zoom of GANTT_ZOOMS) {
      const scale = scaleFor(zoom);
      const barRight = scale.xOf(d("2026-03-01")) + scale.widthOf(d("2026-03-01"), d("2026-03-05"));
      expect(barRight).toBeCloseTo(scale.xOf(d("2026-03-06")), 6);
    }
  });

  it("honours a pxPerDay override, as fit-to-window uses", () => {
    const scale = createGanttScale({
      zoom: "day",
      chartStart: d("2026-01-01"),
      chartEnd: d("2026-01-10"),
      pxPerDay: 12,
    });
    expect(scale.width).toBe(120);
    expect(scale.xOf(d("2026-01-06"))).toBe(60);
  });
});

describe("header bands", () => {
  it("emits one minor cell per day at day zoom", () => {
    const scale = scaleFor("day", "2026-03-01", "2026-03-31");
    const ticks = scale.minorTicks();
    expect(ticks).toHaveLength(31);
    expect(ticks[0].label).toBe("1");
    expect(ticks[0].subLabel).toBe("Sun");
    expect(ticks[0].width).toBe(PX_PER_DAY.day);
  });

  it("sizes month cells from the real calendar, not an average", () => {
    const scale = scaleFor("month", "2026-01-01", "2026-12-31");
    const ticks = scale.minorTicks();
    expect(ticks).toHaveLength(12);
    expect(ticks.map((t) => t.label)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
    // February is genuinely shorter than March.
    expect(ticks[1].width).toBe(28 * PX_PER_DAY.month);
    expect(ticks[2].width).toBe(31 * PX_PER_DAY.month);
  });

  it("emits four quarters and labels the year band above them", () => {
    const scale = scaleFor("quarter", "2026-01-01", "2026-12-31");
    expect(scale.minorTicks().map((t) => t.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(scale.majorTicks().map((t) => t.label)).toEqual(["2026"]);
  });

  it("puts a month band over the days at day zoom", () => {
    const scale = scaleFor("day", "2026-01-15", "2026-03-10");
    expect(scale.majorTicks().map((t) => t.label)).toEqual([
      "January 2026",
      "February 2026",
      "March 2026",
    ]);
  });

  it("clamps a band that starts before the chart to x = 0", () => {
    // The chart opens mid-January, so January's band is a partial cell.
    const scale = scaleFor("day", "2026-01-15", "2026-02-28");
    const [january] = scale.majorTicks();
    expect(january.x).toBe(0);
    expect(january.width).toBe(17 * PX_PER_DAY.day); // Jan 15..31
  });

  it("tiles without gaps or overlaps", () => {
    for (const zoom of GANTT_ZOOMS) {
      const scale = scaleFor(zoom, "2026-02-10", "2027-04-20");
      for (const band of [scale.minorTicks(), scale.majorTicks()]) {
        expect(band[0].x).toBe(0);
        for (let i = 1; i < band.length; i++) {
          expect(band[i].x).toBeCloseTo(band[i - 1].x + band[i - 1].width, 6);
        }
        const last = band[band.length - 1];
        expect(last.x + last.width).toBeCloseTo(scale.width, 6);
      }
    }
  });

  it("builds only the cells inside the window it is given", () => {
    // A ten-year chart at day zoom is ~3650 cells; windowing is what keeps it renderable.
    const scale = scaleFor("day", "2020-01-01", "2029-12-31");
    expect(scale.minorTicks()).toHaveLength(3653);

    const windowed = scale.minorTicks({ start: 1000, end: 2000 });
    expect(windowed.length).toBeLessThanOrEqual(22);
    expect(windowed[0].x).toBeLessThanOrEqual(1000);
    expect(windowed[windowed.length - 1].x).toBeLessThan(2000);
  });

  it("returns nothing for a window off the end of the chart", () => {
    const scale = scaleFor("day", "2026-01-01", "2026-01-10");
    expect(scale.minorTicks({ start: 99999, end: 199999 })).toHaveLength(0);
  });

  it("marks today, and only at day zoom", () => {
    const now = new Date();
    const from = toDateOnly(addDaysOnly(now, -5));
    const to = toDateOnly(addDaysOnly(now, 5));

    const dayTicks = scaleFor("day", from, to).minorTicks();
    expect(dayTicks.filter((t) => t.isToday)).toHaveLength(1);

    // At month zoom a cell is a month; highlighting one as "today" would be wrong.
    expect(scaleFor("month", from, to).minorTicks().every((t) => !t.isToday)).toBe(true);
  });
});

describe("ganttBounds", () => {
  it("pads the data and keeps the padding proportional to the zoom", () => {
    const starts = [d("2026-03-01")];
    const ends = [d("2026-09-30")];

    const day = ganttBounds(starts, ends, "day");
    expect(toDateOnly(day.chartStart)).toBe("2026-02-26");
    expect(toDateOnly(day.chartEnd)).toBe("2026-10-07");

    const quarter = ganttBounds(starts, ends, "quarter");
    expect(toDateOnly(quarter.chartStart)).toBe("2025-12-31");
    // Sep 30 + 120 days of run-out is Jan 28 2027, but that is only 394 days of
    // chart - too narrow to be worth a quarter view - so the floor takes over.
    expect(toDateOnly(quarter.chartEnd)).toBe("2027-06-23");
    expect(daysBetween(quarter.chartStart, quarter.chartEnd) + 1).toBe(540);
  });

  it("widens a single one-day task to a readable span", () => {
    const one = [d("2026-05-04")];
    const { chartStart, chartEnd } = ganttBounds(one, one, "day");
    const scale = createGanttScale({ zoom: "day", chartStart, chartEnd });
    expect(scale.totalDays).toBeGreaterThanOrEqual(14);
  });

  it("falls back to a window around today when nothing is plotted", () => {
    const { chartStart, chartEnd } = ganttBounds([], [], "day");
    const now = new Date();
    expect(chartStart.getTime()).toBeLessThan(now.getTime());
    expect(chartEnd.getTime()).toBeGreaterThan(now.getTime());
  });
});
