/**
 * The Gantt's coordinate system.
 *
 * Everything the chart draws - grid lines, bars, milestones, the today line,
 * and the dependency arrows in the SVG overlay - asks this object where a date
 * sits. That is the whole point of it existing.
 *
 * The old chart had two answers to that question: bars were placed as a
 * percentage of the track's rendered width, while the arrow overlay used raw
 * pixels at a hardcoded 50px/day. Those agree only when the track happens to
 * be exactly `totalDays * 50` wide. Give a short project a wide monitor and the
 * flex track stretches, the bars spread out with it, and the arrows - still
 * measuring in 50px days - stay behind, pointing at nothing.
 *
 * One `xOf()`, in absolute pixels, for every layer. Nothing renders in percent.
 */

import {
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  format,
} from "date-fns";
import type { GanttZoom } from "@/types";
import { addDaysOnly, daysBetween, today, isSameDateOnly } from "./dates";

export type { GanttZoom };

export const GANTT_ZOOMS: GanttZoom[] = ["day", "week", "month", "quarter"];

/**
 * Pixels per day at each zoom, chosen so one cell of the minor band is wide
 * enough for its own label: a day cell stays at the 50px the chart has always
 * used, a week lands near 126px, a month near 150px, a quarter near 165px.
 */
export const PX_PER_DAY: Record<GanttZoom, number> = {
  day: 50,
  week: 18,
  month: 5,
  quarter: 1.8,
};

export const ZOOM_LABELS: Record<GanttZoom, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
};

/** A cell in one of the two header bands. */
export interface GanttTick {
  key: string;
  date: Date;
  /** Pixels from the chart origin. Clamped to 0 for a band running off the left edge. */
  x: number;
  width: number;
  label: string;
  /** Day zoom only: the weekday printed above the date. */
  subLabel?: string;
  isToday: boolean;
}

/** A pixel range to generate ticks for, so a multi-year chart only builds what is on screen. */
export interface PxWindow {
  start: number;
  end: number;
}

export interface GanttScale {
  zoom: GanttZoom;
  pxPerDay: number;
  chartStart: Date;
  chartEnd: Date;
  totalDays: number;
  /** Full chart width in pixels. */
  width: number;
  /** Left edge of `date`. */
  xOf(date: Date): number;
  /** Width of an inclusive span: a same-day task is one unit wide, never zero. */
  widthOf(start: Date, end: Date): number;
  /** The date at a pixel offset, rounded down to a whole day. */
  dateAt(x: number): Date;
  /** Whole days a pixel delta represents - what a drag of `dx` should shift a bar by. */
  daysFromPx(dx: number): number;
  /** Coarse band: month at day/week zoom, year at month/quarter zoom. */
  majorTicks(window?: PxWindow): GanttTick[];
  /** Fine band: day, week, month or quarter. */
  minorTicks(window?: PxWindow): GanttTick[];
}

export interface CreateScaleOptions {
  zoom: GanttZoom;
  chartStart: Date;
  chartEnd: Date;
  /** Monday, matching how the rest of the product reads a week. */
  weekStartsOn?: 0 | 1;
  /** Override for fit-to-window, which solves for the ratio that makes the chart fit. */
  pxPerDay?: number;
}

export function createGanttScale({
  zoom,
  chartStart,
  chartEnd,
  weekStartsOn = 1,
  pxPerDay: pxPerDayOverride,
}: CreateScaleOptions): GanttScale {
  const pxPerDay = pxPerDayOverride ?? PX_PER_DAY[zoom];
  const totalDays = Math.max(1, daysBetween(chartStart, chartEnd) + 1);
  const width = totalDays * pxPerDay;
  const now = today();

  const xOf = (date: Date) => daysBetween(chartStart, date) * pxPerDay;

  const widthOf = (start: Date, end: Date) =>
    Math.max(pxPerDay, (daysBetween(start, end) + 1) * pxPerDay);

  const dateAt = (x: number) => addDaysOnly(chartStart, Math.floor(x / pxPerDay));

  const daysFromPx = (dx: number) => Math.round(dx / pxPerDay);

  /**
   * Walk period boundaries from the one containing the window's left edge,
   * emitting a cell per period. Widths come from the real boundaries, so
   * February and a 92-day quarter size themselves correctly.
   */
  const band = (
    startOfPeriod: (d: Date) => Date,
    nextPeriod: (d: Date) => Date,
    labelOf: (d: Date) => string,
    subLabelOf: ((d: Date) => string) | null,
    keyPrefix: string,
    window: PxWindow | undefined,
    markToday: boolean
  ): GanttTick[] => {
    const from = window ? Math.max(0, window.start) : 0;
    const to = window ? Math.min(width, window.end) : width;
    if (to <= from) return [];

    const ticks: GanttTick[] = [];
    // A period straddling the window's left edge still owns that first column.
    let cursor = startOfPeriod(dateAt(from));
    let guard = 0;

    while (guard++ < 10000) {
      const next = nextPeriod(cursor);
      const rawX = xOf(cursor);
      const nextX = xOf(next);
      if (nextX <= from) {
        cursor = next;
        continue;
      }
      if (rawX >= to) break;

      const x = Math.max(0, rawX);
      ticks.push({
        key: keyPrefix + "-" + cursor.getTime(),
        date: cursor,
        x,
        width: Math.min(nextX, width) - x,
        label: labelOf(cursor),
        subLabel: subLabelOf ? subLabelOf(cursor) : undefined,
        isToday: markToday && isSameDateOnly(cursor, now),
      });
      cursor = next;
    }

    return ticks;
  };

  const minorTicks = (window?: PxWindow): GanttTick[] => {
    switch (zoom) {
      case "day":
        return band(
          (d) => d,
          (d) => addDaysOnly(d, 1),
          (d) => format(d, "d"),
          (d) => format(d, "EEE"),
          "d",
          window,
          true
        );
      case "week":
        return band(
          (d) => startOfWeek(d, { weekStartsOn }),
          (d) => addWeeks(startOfWeek(d, { weekStartsOn }), 1),
          (d) => format(d, "MMM d"),
          null,
          "w",
          window,
          false
        );
      case "month":
        return band(
          startOfMonth,
          (d) => addMonths(startOfMonth(d), 1),
          (d) => format(d, "MMM"),
          null,
          "m",
          window,
          false
        );
      case "quarter":
        return band(
          startOfQuarter,
          (d) => addQuarters(startOfQuarter(d), 1),
          (d) => "Q" + (Math.floor(d.getMonth() / 3) + 1),
          null,
          "q",
          window,
          false
        );
    }
  };

  const majorTicks = (window?: PxWindow): GanttTick[] => {
    if (zoom === "day" || zoom === "week") {
      return band(
        startOfMonth,
        (d) => addMonths(startOfMonth(d), 1),
        (d) => format(d, "MMMM yyyy"),
        null,
        "M",
        window,
        false
      );
    }
    return band(
      startOfYear,
      (d) => addYears(startOfYear(d), 1),
      (d) => format(d, "yyyy"),
      null,
      "Y",
      window,
      false
    );
  };

  return {
    zoom,
    pxPerDay,
    chartStart,
    chartEnd,
    totalDays,
    width,
    xOf,
    widthOf,
    dateAt,
    daysFromPx,
    majorTicks,
    minorTicks,
  };
}

/**
 * Pad the data's own extents into a chart range.
 *
 * The lead-in and run-out scale with the zoom - three days of margin is
 * generous at day zoom and invisible at quarter zoom - and the range is held
 * to a floor so a single one-day task still gets a readable chart instead of
 * one column stretched across the viewport.
 */
export function ganttBounds(
  starts: Date[],
  ends: Date[],
  zoom: GanttZoom
): { chartStart: Date; chartEnd: Date } {
  const pad: Record<GanttZoom, [number, number]> = {
    day: [3, 7],
    week: [7, 21],
    month: [30, 60],
    quarter: [60, 120],
  };
  const minSpan: Record<GanttZoom, number> = {
    day: 14,
    week: 60,
    month: 180,
    quarter: 540,
  };

  const [before, after] = pad[zoom];
  const now = today();

  if (starts.length === 0 || ends.length === 0) {
    return {
      chartStart: addDaysOnly(now, -before),
      chartEnd: addDaysOnly(now, minSpan[zoom] - before),
    };
  }

  const earliest = starts.reduce((a, b) => (b < a ? b : a));
  const latest = ends.reduce((a, b) => (b > a ? b : a));

  const chartStart = addDaysOnly(earliest, -before);
  let chartEnd = addDaysOnly(latest, after);

  const span = daysBetween(chartStart, chartEnd) + 1;
  if (span < minSpan[zoom]) {
    chartEnd = addDaysOnly(chartStart, minSpan[zoom] - 1);
  }

  return { chartStart, chartEnd };
}
