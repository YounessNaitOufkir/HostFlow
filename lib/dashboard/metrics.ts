/**
 * Everything the dashboard counts, computed away from the rendering.
 *
 * Extracted because the old version decided what "done" meant inline, by
 * comparing against the literal string "Done". Boards do not agree on that word
 * - the importer writes each board's own labels into column.settings.statusLabels,
 * so an imported French board says "Terminé" - and the result was a Completed
 * tile reading 0 on a board that was mostly finished. The rule lives in
 * lib/statusSemantics, and this module asks it rather than re-deciding.
 */

import type { Board, Group, Item, Profile, StatusOption } from "@/types";
import { STATUS_OPTIONS } from "@/types";
import { firstStatusValue, isDoneStatusValue } from "@/lib/statusSemantics";
import { endDateOf, toDateOnly, addDaysOnly } from "@/lib/gantt/dates";

/** Days ahead that "due soon" covers, counting today. */
export const DUE_SOON_DAYS = 7;

/** Shown when a status has no colour of its own. */
const NEUTRAL = "#c4c4c4";

export interface StatusSlice {
  label: string;
  value: number;
  /** Share of all counted items, 0-100, rounded. */
  pct: number;
  color: string;
}

export interface BarDatum {
  /** Stable identity - the colour and ordering follow this, never the row number. */
  key: string;
  label: string;
  value: number;
}

export interface DashboardMetrics {
  total: number;
  done: number;
  donePct: number;
  /** Past its end date and not finished. */
  overdue: number;
  /** Due today through today + DUE_SOON_DAYS - 1, and not finished. */
  dueSoon: number;
  /** Every status actually present, largest first. */
  statuses: StatusSlice[];
  byAssignee: BarDatum[];
  byGroup: BarDatum[];
  /** Items carrying no date at all - neither overdue nor due soon can see them. */
  undated: number;
}

/**
 * Tailwind's `bg-[#rrggbb]` unwrapped to a plain hex.
 *
 * Status colours are stored as class names because that is what the board cells
 * render. Returns null for anything that is not a single flat colour - the
 * "Overdue" option is a gradient, which cannot be a chart fill.
 */
export function hexFromStatusColor(color: string | undefined): string | null {
  if (!color) return null;
  const match = color.match(/^bg-\[(#[0-9a-fA-F]{3,8})\]$/);
  return match ? match[1] : null;
}

/** The status palette this board actually uses, custom labels included. */
function statusOptionsFor(board: Board): StatusOption[] {
  const col = board.columns?.find((c) => c.type === "status");
  return col?.settings?.statusLabels || STATUS_OPTIONS;
}

/** The date an item is judged by, from the first date or timeline column holding one. */
export function dueDateOf(board: Board, item: Item): Date | null {
  const values = item.column_values || {};
  for (const col of board.columns || []) {
    if (col.type !== "date" && col.type !== "timeline") continue;
    const date = endDateOf(values[col.id]);
    if (date) return date;
  }
  return null;
}

/** The assignee id on an item, tolerating the several shapes a people cell takes. */
export function assigneeIdOf(board: Board, item: Item): string | null {
  const values = item.column_values || {};
  for (const col of board.columns || []) {
    if (col.type !== "people") continue;
    const raw = values[col.id];
    if (typeof raw === "string" && raw) return raw;
    if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
    if (raw && typeof raw === "object") {
      const id = (raw as Record<string, unknown>).id;
      if (typeof id === "string") return id;
    }
  }
  return null;
}

export function computeDashboardMetrics(
  board: Board | null,
  groups: Group[],
  items: Item[],
  profiles: Profile[],
  now: Date = new Date()
): DashboardMetrics {
  const empty: DashboardMetrics = {
    total: 0, done: 0, donePct: 0, overdue: 0, dueSoon: 0,
    statuses: [], byAssignee: [], byGroup: [], undated: 0,
  };
  if (!board) return empty;

  const options = statusOptionsFor(board);
  const colorOf = (label: string) =>
    hexFromStatusColor(options.find((o) => o.label === label)?.color) ??
    hexFromStatusColor(STATUS_OPTIONS.find((o) => o.label === label)?.color) ??
    NEUTRAL;

  const todayStr = toDateOnly(now);
  const horizonStr = toDateOnly(addDaysOnly(now, DUE_SOON_DAYS - 1));

  const statusCounts = new Map<string, number>();
  const assigneeCounts = new Map<string, number>();
  let done = 0, overdue = 0, dueSoon = 0, undated = 0;

  for (const item of items) {
    const status = firstStatusValue(board.columns || [], item.column_values);
    // An item with no status still exists; it is counted under one visible label
    // rather than silently dropped, which is what made the ring add up to less
    // than the task count.
    const label = status && status.trim() ? status : "Not Started";
    statusCounts.set(label, (statusCounts.get(label) || 0) + 1);

    const finished = isDoneStatusValue(status);
    if (finished) done++;

    const due = dueDateOf(board, item);
    if (!due) {
      undated++;
    } else if (!finished) {
      // Compared as yyyy-MM-dd strings, which sort lexicographically and cannot
      // drift by a timezone the way two Date objects can.
      const dueStr = toDateOnly(due);
      if (dueStr < todayStr) overdue++;
      else if (dueStr <= horizonStr) dueSoon++;
    }

    const assignee = assigneeIdOf(board, item);
    if (assignee) assigneeCounts.set(assignee, (assigneeCounts.get(assignee) || 0) + 1);
  }

  const total = items.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const statuses: StatusSlice[] = [...statusCounts.entries()]
    .map(([label, value]) => ({ label, value, pct: pct(value), color: colorOf(label) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  const byAssignee: BarDatum[] = [...assigneeCounts.entries()]
    .map(([id, value]) => ({
      key: id,
      label: profiles.find((p) => p.id === id)?.full_name || "Unassigned",
      value,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  const byGroup: BarDatum[] = groups
    .map((g) => ({
      key: g.id,
      label: g.title,
      value: items.filter((i) => i.group_id === g.id).length,
    }))
    .filter((g) => g.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  return {
    total, done, donePct: pct(done), overdue, dueSoon,
    statuses, byAssignee, byGroup, undated,
  };
}
