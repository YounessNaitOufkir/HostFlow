import { describe, it, expect } from "vitest";
import { visibleRowRange, visiblePxWindow, type Positioned } from "@/lib/gantt/virtual";

/** `n` rows of uniform height, laid out the way rows.ts lays them out. */
function rows(n: number, height = 60): Positioned[] {
  return Array.from({ length: n }, (_, i) => ({ y: i * height, height }));
}

/** Alternating group (40) and item (60) rows, the real shape of a board chart. */
function mixedRows(n: number): Positioned[] {
  const out: Positioned[] = [];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const height = i % 4 === 0 ? 40 : 60;
    out.push({ y, height });
    y += height;
  }
  return out;
}

describe("visibleRowRange", () => {
  it("renders only the rows on screen, plus overscan", () => {
    // 1000 rows of 60px; an 800px viewport holds about 14.
    const range = visibleRowRange(rows(1000), 0, 800, 6);
    expect(range.start).toBe(0);
    expect(range.end).toBe(20); // 14 visible + 6 overscan below
    expect(range.end - range.start).toBeLessThan(30);
  });

  it("follows the scroll position", () => {
    const range = visibleRowRange(rows(1000), 6000, 800, 6);
    // Row 100 sits at y = 6000.
    expect(range.start).toBe(94);
    expect(range.end).toBe(120);
  });

  it("pads both sides so a fast scroll does not reveal empty space", () => {
    const none = visibleRowRange(rows(1000), 6000, 800, 0);
    const padded = visibleRowRange(rows(1000), 6000, 800, 10);
    expect(none.start - padded.start).toBe(10);
    expect(padded.end - none.end).toBe(10);
  });

  it("includes a row only partly in view at either edge", () => {
    // Scrolled 30px into row 0, which is 60 tall - it is still half visible.
    const range = visibleRowRange(rows(10), 30, 120, 0);
    expect(range.start).toBe(0);
    // Covers rows 0,1,2 and the sliver of row 2 at the bottom edge.
    expect(range.end).toBe(3);
  });

  it("clamps at the top and bottom of the list", () => {
    expect(visibleRowRange(rows(100), 0, 800).start).toBe(0);
    const atBottom = visibleRowRange(rows(100), 100 * 60, 800);
    expect(atBottom.end).toBe(100);
    expect(atBottom.start).toBeLessThanOrEqual(100);
  });

  it("handles rows of differing heights", () => {
    const list = mixedRows(200);
    const range = visibleRowRange(list, 1000, 600, 0);
    // Every row in the window must actually overlap the viewport.
    for (let i = range.start; i < range.end; i++) {
      expect(list[i].y + list[i].height).toBeGreaterThan(1000);
      expect(list[i].y).toBeLessThan(1600);
    }
    // And the row just before the window must not.
    if (range.start > 0) {
      const previous = list[range.start - 1];
      expect(previous.y + previous.height).toBeLessThanOrEqual(1000);
    }
  });

  it("renders a screenful before the viewport has been measured", () => {
    // Otherwise the chart is blank until the first scroll or resize event.
    const range = visibleRowRange(rows(1000), 0, 0);
    expect(range.start).toBe(0);
    expect(range.end).toBe(40);
  });

  it("returns an empty window for an empty chart", () => {
    expect(visibleRowRange([], 0, 800)).toEqual({ start: 0, end: 0 });
  });

  it("covers every row when the viewport is taller than the content", () => {
    expect(visibleRowRange(rows(5), 0, 5000, 0)).toEqual({ start: 0, end: 5 });
  });
});

describe("visiblePxWindow", () => {
  it("windows the timeline around the scroll position", () => {
    expect(visiblePxWindow(5000, 1200, 100000, 400)).toEqual({ start: 4600, end: 6600 });
  });

  it("clamps to the chart's own extents", () => {
    expect(visiblePxWindow(0, 1200, 100000, 400).start).toBe(0);
    expect(visiblePxWindow(99000, 1200, 100000, 400).end).toBe(100000);
  });

  it("falls back to a fixed slice before measurement", () => {
    expect(visiblePxWindow(0, 0, 100000)).toEqual({ start: 0, end: 2000 });
  });

  it("never asks for more than the chart is wide", () => {
    expect(visiblePxWindow(0, 0, 500)).toEqual({ start: 0, end: 500 });
  });
});
