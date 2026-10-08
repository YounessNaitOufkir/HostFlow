/**
 * Trackpad and wheel gestures on the Gantt.
 *
 * The chart has one real scroller (the bars). The task pane and the date header
 * are clipped viewports translated to follow it, so a two-finger swipe over
 * either one used to do nothing at all: it hit an element that cannot scroll.
 * GanttChart forwards those swipes to the scroller with these helpers, and
 * turns a pinch into the chart's own zoom instead of the browser's page zoom.
 */

import { GANTT_ZOOMS, PX_PER_DAY, type GanttZoom } from "./scale";

/** WheelEvent.deltaMode values, named. */
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** What one "line" of a line-mode wheel is worth, as Firefox and Chrome treat it. */
const LINE_HEIGHT_PX = 16;

/**
 * A wheel event's travel in pixels. Trackpads report pixels already; some mice
 * (Firefox on Windows/Linux) report lines or pages instead.
 */
export function wheelDeltaPx(
  e: Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "shiftKey">,
  page: { width: number; height: number }
): { dx: number; dy: number } {
  let dx = e.deltaX;
  let dy = e.deltaY;
  if (e.deltaMode === DOM_DELTA_LINE) {
    dx *= LINE_HEIGHT_PX;
    dy *= LINE_HEIGHT_PX;
  } else if (e.deltaMode === DOM_DELTA_PAGE) {
    dx *= page.width;
    dy *= page.height;
  }
  // Shift+wheel is the usual "scroll sideways" on a mouse; browsers do it for
  // a real scroller, so a forwarded one does it too.
  if (e.shiftKey && dx === 0) return { dx: dy, dy: 0 };
  return { dx, dy };
}

/**
 * Where a swipe over the date header goes. The header only moves sideways, so
 * an up/down swipe on it scrolls through time rather than being lost.
 */
export function headerSwipe(delta: { dx: number; dy: number }): { dx: number; dy: number } {
  if (Math.abs(delta.dy) > Math.abs(delta.dx)) return { dx: delta.dy, dy: 0 };
  return { dx: delta.dx, dy: 0 };
}

/**
 * Pinch travel (summed ctrl+wheel deltaY) that makes one zoom step. A trackpad
 * pinch sends many small deltas; a ctrl+mouse-wheel notch sends ~100 at once,
 * so one notch is one step either way.
 */
export const PINCH_STEP = 40;

/**
 * The zoom one pinch step reaches from the density on screen: -1 is closer in,
 * +1 further out. Measured from pixels per day rather than the zoom's name,
 * because fit-to-window shows a zoom at its own density - a fitted year sits
 * well below month zoom's usual width, and pinching in from there should land
 * on month, not jump to week. Null when there is nothing further that way.
 */
export function zoomToward(pxPerDay: number, direction: -1 | 1): GanttZoom | null {
  const candidates = GANTT_ZOOMS.filter((zoom) =>
    direction < 0 ? PX_PER_DAY[zoom] > pxPerDay * 1.01 : PX_PER_DAY[zoom] < pxPerDay * 0.99
  );
  if (candidates.length === 0) return null;
  // The nearest one: the least magnified going in, the most going out.
  return candidates.reduce((best, zoom) =>
    direction < 0
      ? PX_PER_DAY[zoom] < PX_PER_DAY[best] ? zoom : best
      : PX_PER_DAY[zoom] > PX_PER_DAY[best] ? zoom : best
  );
}
