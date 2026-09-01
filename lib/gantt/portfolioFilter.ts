/**
 * Narrowing a portfolio down to what you actually want to look at.
 *
 * The board Gantt inherits the board's own filter bar. The Master Gantt had
 * nothing: a dozen boards' worth of tasks arrived as one wall, and the only
 * control was which boards to include - all or nothing per board. Asking "what
 * is Amina on across every property this month" meant reading the whole chart.
 *
 * Every clause is a narrowing, and an empty clause narrows nothing, so the
 * filters combine the way people expect: owner AND status AND window.
 */

import type { Board, Item } from "@/types";
import { parseDateOnly, toDateOnly } from "./dates";
import { resolveStatusColumn } from "./config";
import { assigneeIdsOf, plotItemDates } from "./rows";

export interface PortfolioFilter {
  /** Profile ids. Empty means every owner. */
  assigneeIds: string[];
  /** Status labels. Empty means every status. */
  statuses: string[];
  /** Inclusive "yyyy-MM-dd" bounds. A task is kept when its span overlaps them. */
  from?: string;
  to?: string;
}

export const EMPTY_PORTFOLIO_FILTER: PortfolioFilter = {
  assigneeIds: [],
  statuses: [],
};

export function isPortfolioFilterActive(filter: PortfolioFilter): boolean {
  return (
    filter.assigneeIds.length > 0 ||
    filter.statuses.length > 0 ||
    Boolean(filter.from) ||
    Boolean(filter.to)
  );
}

export function countActiveClauses(filter: PortfolioFilter): number {
  return (
    (filter.assigneeIds.length > 0 ? 1 : 0) +
    (filter.statuses.length > 0 ? 1 : 0) +
    (filter.from || filter.to ? 1 : 0)
  );
}

/** The status label an item carries, read from its own board's status column. */
export function statusOf(item: Item, board: Board | undefined): string | null {
  const column = resolveStatusColumn(board);
  if (!column) return null;
  const value = item.column_values?.[column.id];
  return typeof value === "string" && value ? value : null;
}

export function filterPortfolioItems(
  items: Item[],
  boardsById: Map<string, Board>,
  filter: PortfolioFilter
): Item[] {
  if (!isPortfolioFilterActive(filter)) return items;

  const wantedAssignees = new Set(filter.assigneeIds);
  const wantedStatuses = new Set(filter.statuses);
  const from = filter.from ? parseDateOnly(filter.from) : null;
  const to = filter.to ? parseDateOnly(filter.to) : null;

  return items.filter((item) => {
    const board = boardsById.get(item.board_id);

    if (wantedAssignees.size > 0) {
      const owners = board ? assigneeIdsOf(item, board) : [];
      if (!owners.some((id) => wantedAssignees.has(id))) return false;
    }

    if (wantedStatuses.size > 0) {
      const status = statusOf(item, board);
      if (!status || !wantedStatuses.has(status)) return false;
    }

    if (from || to) {
      // Overlap, not containment: a task running through the window is in it,
      // even though neither of its own dates falls inside.
      const plotted = board ? plotItemDates(item, board) : null;
      if (!plotted) return false;
      if (to && plotted.start > to) return false;
      if (from && plotted.end < from) return false;
    }

    return true;
  });
}

/** Every owner appearing on these items, for the filter's own menu. */
export function assigneesInPortfolio(
  items: Item[],
  boardsById: Map<string, Board>
): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    const board = boardsById.get(item.board_id);
    if (!board) continue;
    for (const id of assigneeIdsOf(item, board)) ids.add(id);
  }
  return Array.from(ids);
}

/** Every status label in use, so the menu offers what is actually there. */
export function statusesInPortfolio(
  items: Item[],
  boardsById: Map<string, Board>
): string[] {
  const labels = new Set<string>();
  for (const item of items) {
    const status = statusOf(item, boardsById.get(item.board_id));
    if (status) labels.add(status);
  }
  return Array.from(labels).sort((a, b) => a.localeCompare(b));
}

/** Ready-made windows, since a date pair is fiddly for the common cases. */
export type PortfolioWindowPreset = "all" | "30" | "90" | "quarter" | "custom";

export function windowForPreset(
  preset: PortfolioWindowPreset,
  today: Date
): { from?: string; to?: string } {
  const shift = (days: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);

  switch (preset) {
    case "30":
      return { from: toDateOnly(today), to: toDateOnly(shift(30)) };
    case "90":
      return { from: toDateOnly(today), to: toDateOnly(shift(90)) };
    case "quarter": {
      const first = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 3, 0);
      return { from: toDateOnly(first), to: toDateOnly(last) };
    }
    default:
      return {};
  }
}
