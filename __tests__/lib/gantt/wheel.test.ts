import { describe, it, expect } from "vitest";
import { headerSwipe, wheelDeltaPx, zoomToward } from "@/lib/gantt/wheel";
import { PX_PER_DAY } from "@/lib/gantt/scale";

const page = { width: 800, height: 600 };
const wheel = (deltaX: number, deltaY: number, deltaMode = 0, shiftKey = false) => ({
  deltaX,
  deltaY,
  deltaMode,
  shiftKey,
});

describe("wheelDeltaPx", () => {
  it("passes a trackpad's pixel deltas through", () => {
    expect(wheelDeltaPx(wheel(12, -30), page)).toEqual({ dx: 12, dy: -30 });
  });

  it("turns a mouse's line deltas into pixels", () => {
    expect(wheelDeltaPx(wheel(0, 3, 1), page)).toEqual({ dx: 0, dy: 48 });
  });

  it("turns page deltas into the viewport's size", () => {
    expect(wheelDeltaPx(wheel(1, 1, 2), page)).toEqual({ dx: 800, dy: 600 });
  });

  it("scrolls sideways on shift+wheel", () => {
    expect(wheelDeltaPx(wheel(0, 40, 0, true), page)).toEqual({ dx: 40, dy: 0 });
  });
});

describe("headerSwipe", () => {
  it("turns an up/down swipe over the dates into moving through time", () => {
    expect(headerSwipe({ dx: 2, dy: 50 })).toEqual({ dx: 50, dy: 0 });
  });

  it("keeps a sideways swipe sideways and drops its vertical drift", () => {
    expect(headerSwipe({ dx: -60, dy: 5 })).toEqual({ dx: -60, dy: 0 });
  });
});

describe("zoomToward", () => {
  it("steps one zoom at a time from the named densities", () => {
    expect(zoomToward(PX_PER_DAY.day, 1)).toBe("week");
    expect(zoomToward(PX_PER_DAY.week, 1)).toBe("month");
    expect(zoomToward(PX_PER_DAY.month, -1)).toBe("week");
    expect(zoomToward(PX_PER_DAY.week, -1)).toBe("day");
  });

  it("stops at either end", () => {
    expect(zoomToward(PX_PER_DAY.day, -1)).toBeNull();
    expect(zoomToward(PX_PER_DAY.month, 1)).toBeNull();
  });

  it("reads a fitted density by its pixels, not its zoom's name", () => {
    // A long plan fitted below month zoom: pinching in lands on month first.
    expect(zoomToward(2, -1)).toBe("month");
    // A short plan stretched wider than day zoom: pinching out lands on day.
    expect(zoomToward(80, 1)).toBe("day");
    // Between week and day: in is day, out is week.
    expect(zoomToward(30, -1)).toBe("day");
    expect(zoomToward(30, 1)).toBe("week");
  });
});
