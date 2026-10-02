import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React, { useState } from "react";
import DateCalendar, { type DateValue, formatDateValue, orderedRange } from "@/components/ui/DateCalendar";
import DatePopover, { normalizeDateValue } from "@/components/ui/DatePopover";
import TimelineCell from "@/components/cells/TimelineCell";
import { enUS } from "date-fns/locale";
import type { Column, Item } from "@/types";

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

/** The day button for a date in the visible month, by its number. */
const day = (n: number) =>
  screen.getAllByRole("button").find((b) => b.classList.contains("hf-day-btn") && b.textContent === String(n))!;

function RangeHarness({ initial, onApply = () => {} }: { initial: DateValue; onApply?: (v: DateValue) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateCalendar mode="range" value={value} onChange={setValue} onApply={onApply} onClear={() => setValue({ start: null, end: null })} />
      <output data-testid="value">{`${value.start}|${value.end}`}</output>
    </>
  );
}
const shown = () => screen.getByTestId("value").textContent;

describe("DateCalendar range", () => {
  it("picks a start, then an end, and saves on the end", () => {
    const onApply = vi.fn();
    render(<RangeHarness initial={{ start: "2026-03-01", end: "2026-03-03" }} onApply={onApply} />);
    // Opening starts a fresh pick: the first click is the start.
    fireEvent.click(day(5));
    expect(shown()).toBe("2026-03-05|null");
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(day(16));
    expect(shown()).toBe("2026-03-05|2026-03-16");
    expect(onApply).toHaveBeenCalledWith({ start: "2026-03-05", end: "2026-03-16" });
    expect(screen.getByText("12 days")).toBeTruthy();
  });

  it("makes an earlier day the new start instead of a backwards range", () => {
    const onApply = vi.fn();
    render(<RangeHarness initial={{ start: null, end: null }} onApply={onApply} />);
    fireEvent.click(day(10));
    fireEvent.click(day(4));
    // No stored value, so the calendar opens on the current month.
    expect(shown()).toMatch(/^\d{4}-\d{2}-04\|null$/);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("gives a one-day range when the same day is clicked twice", () => {
    render(<RangeHarness initial={{ start: null, end: null }} />);
    fireEvent.click(day(15));
    fireEvent.click(day(15));
    expect(shown()).toMatch(/-15\|.*-15$/);
    expect(screen.getByText("1 day")).toBeTruthy();
  });

  it("builds a range across months, one month on screen", () => {
    render(<RangeHarness initial={{ start: null, end: null }} />);
    expect(screen.getAllByRole("grid")).toHaveLength(1);
    fireEvent.click(day(28));
    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    fireEvent.click(day(3));
    const [start, end] = shown()!.split("|");
    expect(Number(end.slice(5, 7))).toBe(Number(start.slice(5, 7)) % 12 + 1);
    expect(end.slice(8)).toBe("03");
  });

  it("previews the band while choosing the end", () => {
    render(<RangeHarness initial={{ start: "2026-03-01", end: null }} />);
    fireEvent.click(day(10));
    fireEvent.mouseEnter(day(14));
    expect(day(12).closest("td")?.className).toContain("hf-mid");
    expect(day(14).closest("td")?.className).toContain("hf-preview");
  });
});

describe("value helpers", () => {
  it("reads reversed stored ranges in order", () => {
    const { from, to } = orderedRange({ start: "2026-05-09", end: "2026-05-01" });
    expect([from?.getDate(), to?.getDate()]).toEqual([1, 9]);
  });

  it("gives a lone start an end unless open-ended", () => {
    expect(normalizeDateValue({ start: "2026-05-01", end: null }, "range")).toEqual({ start: "2026-05-01", end: "2026-05-01" });
    expect(normalizeDateValue({ start: "2026-05-01", end: null }, "range", true)).toEqual({ start: "2026-05-01", end: null });
    expect(normalizeDateValue({ start: null, end: "2026-05-09" }, "range", true)).toEqual({ start: null, end: "2026-05-09" });
  });

  it("labels open-ended windows", () => {
    const t = (k: string, v: Record<string, string>) => `${k}:${v.date}`;
    expect(formatDateValue({ start: "2026-05-01", end: null }, "range", enUS, t)).toBe("date.from:1 May");
    expect(formatDateValue({ start: null, end: "2026-05-09" }, "range", enUS, t)).toBe("date.until:9 May");
    expect(formatDateValue({ start: "2026-05-01", end: "2026-05-09" }, "range", enUS, t)).toBe("1 May – 9 May");
  });
});

describe("DatePopover", () => {
  it("commits a single date on click and closes", () => {
    const onCommit = vi.fn();
    render(<DatePopover mode="single" value={{ start: "2026-03-01", end: null }} onCommit={onCommit}>open</DatePopover>);
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(day(9));
    expect(onCommit).toHaveBeenCalledWith({ start: "2026-03-09", end: null });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancels on Escape without saving", () => {
    const onCommit = vi.fn();
    render(<DatePopover mode="range" value={{ start: "2026-03-01", end: "2026-03-03" }} onCommit={onCommit}>open</DatePopover>);
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(day(20));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves a range and closes when its end is picked, with no Apply step", () => {
    const onCommit = vi.fn();
    render(<DatePopover mode="range" value={{ start: "2026-03-01", end: "2026-03-03" }} onCommit={onCommit}>open</DatePopover>);
    fireEvent.click(screen.getByText("open"));
    expect(within(screen.getByRole("dialog")).queryByText("Apply")).toBeNull();
    fireEvent.click(day(18));
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(day(20));
    expect(onCommit).toHaveBeenCalledWith({ start: "2026-03-18", end: "2026-03-20" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("TimelineCell", () => {
  const column = { id: "tl", title: "Timeline", type: "timeline" } as Column;
  const item = (v: unknown) => ({ id: "i1", board_id: "b", group_id: "g", name: "x", position: 0, column_values: { tl: v } }) as Item;

  it("shows a stored date on the day it was saved, in every timezone", () => {
    render(<TimelineCell item={item({ start: "2026-03-01", end: "2026-03-01" })} column={column} onUpdate={() => {}} />);
    expect(screen.getByText("Mar 1")).toBeTruthy();
  });

  it("saves null when the dates are cleared", () => {
    const onUpdate = vi.fn();
    render(<TimelineCell item={item({ start: "2026-03-01", end: "2026-03-04" })} column={column} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText("Mar 1 – 4"));
    fireEvent.click(screen.getByText("Clear dates"));
    expect(onUpdate).toHaveBeenCalledWith("i1", "tl", null);
  });
});

describe("Today button", () => {
  it("sets a timeline to a one-day range on today, saved at once", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 2, 15, 30));
    const onApply = vi.fn();
    render(<RangeHarness initial={{ start: "2026-03-01", end: "2026-03-05" }} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onApply).toHaveBeenCalledWith({ start: "2026-10-02", end: "2026-10-02" });
    vi.useRealTimers();
  });

  it("sets a single date to today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 2, 23, 50));
    const onApply = vi.fn();
    render(<DateCalendar mode="single" value={{ start: null, end: null }} onChange={() => {}} onApply={onApply} onClear={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    // Local date, not UTC: 23:50 on the 2nd stays the 2nd.
    expect(onApply).toHaveBeenCalledWith({ start: "2026-10-02", end: null });
    vi.useRealTimers();
  });
});
