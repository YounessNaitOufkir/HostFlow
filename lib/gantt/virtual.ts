/**
 * Which rows are actually on screen.
 *
 * The chart rendered every row and every day column, which is survivable on one
 * board and is not on a portfolio: a two-year cross-board rollup is hundreds of
 * header cells and thousands of rows, all mounted, all re-rendering on every
 * scroll frame.
 *
 * Row offsets are already computed once in `rows.ts` and increase monotonically,
 * so finding the visible slice is a binary search rather than a measurement
 * pass - which is why this needs no virtualization library and no ResizeObserver.
 */

export interface Positioned {
  y: number;
  height: number;
}

export interface RowWindow {
  /** Index of the first row to render, inclusive. */
  start: number;
  /** Index one past the last row to render. */
  end: number;
}

/**
 * The first row whose bottom edge is past `offset`.
 *
 * Rows are laid out top to bottom without gaps, so `y` is sorted and the search
 * is a plain bisection.
 */
function firstRowAtOrAfter(rows: Positioned[], offset: number): number {
  let low = 0;
  let high = rows.length - 1;
  let found = rows.length;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const row = rows[mid];
    if (row.y + row.height > offset) {
      found = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return found;
}

/**
 * The slice of rows covering the viewport, padded by `overscan` rows either
 * side so a fast scroll does not show a band of empty space before React
 * catches up.
 */
export function visibleRowRange(
  rows: Positioned[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 6
): RowWindow {
  if (rows.length === 0) return { start: 0, end: 0 };

  // Before layout has measured the viewport, render a screenful rather than
  // nothing - otherwise the chart is blank until the first scroll or resize.
  if (viewportHeight <= 0) {
    return { start: 0, end: Math.min(rows.length, 40) };
  }

  const first = firstRowAtOrAfter(rows, scrollTop);
  const bottom = scrollTop + viewportHeight;

  let last = first;
  while (last < rows.length && rows[last].y < bottom) last++;

  return {
    start: Math.max(0, first - overscan),
    end: Math.min(rows.length, last + overscan),
  };
}

/** The horizontal slice of the timeline on screen, in pixels, padded for the same reason. */
export function visiblePxWindow(
  scrollLeft: number,
  viewportWidth: number,
  totalWidth: number,
  overscanPx = 400
): { start: number; end: number } {
  if (viewportWidth <= 0) {
    return { start: 0, end: Math.min(totalWidth, 2000) };
  }
  return {
    start: Math.max(0, scrollLeft - overscanPx),
    end: Math.min(totalWidth, scrollLeft + viewportWidth + overscanPx),
  };
}
