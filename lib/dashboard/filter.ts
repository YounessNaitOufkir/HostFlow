/**
 * One filter for the whole dashboard.
 *
 * Every tile and every chart reads the same slice, so a reader can never compare
 * two cards that were scoped differently. It also closes a quieter gap: the board's
 * own FilterBar produced filters.filteredItems for Kanban and the table, while the
 * dashboard was handed state.items and silently ignored it.
 */

import type { Board, Item } from "@/types";
import { toDateOnly } from "@/lib/gantt/dates";
import { dueDateOf, assigneeIdsOf } from "@/lib/dashboard/metrics";

// The window presets are the portfolio's, imported rather than restated so the
// Master Gantt and the dashboard cannot drift on what "this quarter" means.
export { windowForPreset } from "@/lib/gantt/portfolioFilter";
export type { PortfolioWindowPreset as DashboardWindowPreset } from "@/lib/gantt/portfolioFilter";

export interface DashboardFilter {
  /** Inclusive yyyy-MM-dd bounds on the item's due date. */
  from?: string;
  to?: string;
  assigneeIds: string[];
  groupIds: string[];
}

export const EMPTY_DASHBOARD_FILTER: DashboardFilter = {
  assigneeIds: [],
  groupIds: [],
};

export function isDashboardFilterActive(filter: DashboardFilter): boolean {
  return Boolean(
    filter.from || filter.to || filter.assigneeIds.length || filter.groupIds.length
  );
}

/** How many separate conditions are on, for the badge on the button. */
export function countActiveClauses(filter: DashboardFilter): number {
  let n = 0;
  if (filter.from || filter.to) n++;
  if (filter.assigneeIds.length) n++;
  if (filter.groupIds.length) n++;
  return n;
}

export function applyDashboardFilter(
  board: Board | null,
  items: Item[],
  filter: DashboardFilter
): Item[] {
  if (!board || !isDashboardFilterActive(filter)) return items;

  return items.filter((item) => {
    if (filter.groupIds.length && !filter.groupIds.includes(item.group_id)) return false;

    if (filter.assigneeIds.length) {
      // Matches on ANY assignee: filtering by one person must still find the
      // tasks they share with someone else.
      const assignees = assigneeIdsOf(board, item);
      if (!assignees.some((id) => filter.assigneeIds.includes(id))) return false;
    }

    if (filter.from || filter.to) {
      const due = dueDateOf(board, item);
      // An undated task is not in any window. It is excluded rather than kept,
      // so "due next 30 days" cannot report a count that includes tasks with no
      // date at all - the metrics surface an `undated` figure separately.
      if (!due) return false;
      const dueStr = toDateOnly(due);
      if (filter.from && dueStr < filter.from) return false;
      if (filter.to && dueStr > filter.to) return false;
    }

    return true;
  });
}
