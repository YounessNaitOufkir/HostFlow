/**
 * Everything the dashboard counts, computed away from the rendering.
 *
 * Extracted because the old version decided what "done" meant inline, by
 * comparing against the literal string "Done". Boards do not agree on that word
 * - the importer writes each board's own labels into column.settings.statusLabels,
 * so an imported French board says "Terminé" - and the result was a Completed
 * tile reading 0 on a board that was mostly finished. The rules live in
 * lib/statusSemantics, and this module asks them rather than re-deciding.
 */

import type { Board, Group, Item, Profile, StatusOption } from "@/types";
import { STATUS_OPTIONS } from "@/types";
import {
  firstStatusValue,
  isDoneStatusValue,
  isStuckStatusValue,
  isWorkingStatusValue,
} from "@/lib/statusSemantics";
import { endDateOf, toDateOnly, addDaysOnly, daysBetween } from "@/lib/gantt/dates";

/** Days ahead that "due soon" covers, counting today. */
export const DUE_SOON_DAYS = 7;

/** How many rows the attention list shows before it starts hiding them. */
export const ATTENTION_LIMIT = 7;

/** Shown when a status or group has no colour of its own. */
const NEUTRAL = "#c4c4c4";

/**
 * One restrained hue for every assignee bar.
 *
 * Not a colour per person: a muted six-hue palette fails the normal-vision
 * separation floor - the greyed-off steps become indistinguishable from each
 * other even with full colour vision - and a saturated one is the loud look we
 * are getting away from. Each row is already labelled with the person's name,
 * so hue has no identity work left to do. Groups keep their own colours because
 * those are the colours the board itself shows.
 */
export const ASSIGNEE_BAR_COLOR = "#3d6fa8";

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
  color: string;
}

export interface AttentionTask {
  id: string;
  name: string;
  groupTitle: string;
  groupColor: string;
  ownerName: string | null;
  /** Whole days from today: negative is late, 0 is today. */
  offsetDays: number;
}

export interface DashboardMetrics {
  total: number;
  done: number;
  donePct: number;
  working: number;
  stuck: number;
  /** Past its end date and not finished. */
  overdue: number;
  /** Due today through today + DUE_SOON_DAYS - 1, and not finished. */
  dueSoon: number;
  /** Every status actually present, largest first. */
  statuses: StatusSlice[];
  byAssignee: BarDatum[];
  byGroup: BarDatum[];
  /** Late or due this week, soonest deadline first, capped at ATTENTION_LIMIT. */
  attention: AttentionTask[];
  /** How many qualify in total, so the list can say what it is not showing. */
  attentionTotal: number;
  /** Items carrying no date at all - neither overdue nor due soon can see them. */
  undated: number;
}

/**
 * Tailwind's `bg-[#rrggbb]` unwrapped to a plain hex.
 *
 * Status colours are stored as class names because that is what the board cells
 * render. Flat colours come back as-is; a gradient resolves to its first stop;
 * anything unrecognised returns null so the caller can fall back.
 */
export function hexFromStatusColor(color: string | undefined): string | null {
  if (!color) return null;

  const flat = color.match(/^bg-\[(#[0-9a-fA-F]{3,8})\]$/);
  if (flat) return flat[1];

  // A gradient cannot be a chart fill, but refusing it outright painted the
  // built-in "Overdue" status grey - the one status a reader most needs to
  // pick out. Resolve it to where the gradient starts instead. Only the stops
  // the app actually ships are listed; anything else still falls back.
  const from = color.match(/from-([a-z]+-\d{3})/);
  return from ? GRADIENT_STOPS[from[1]] ?? null : null;
}

/** Tailwind stops used by STATUS_OPTIONS gradients. */
const GRADIENT_STOPS: Record<string, string> = {
  "red-600": "#dc2626",
  "rose-600": "#e11d48",
};

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
    total: 0, done: 0, donePct: 0, working: 0, stuck: 0, overdue: 0, dueSoon: 0,
    statuses: [], byAssignee: [], byGroup: [], attention: [], attentionTotal: 0, undated: 0,
  };
  if (!board) return empty;

  const options = statusOptionsFor(board);
  const colorOf = (label: string) =>
    hexFromStatusColor(options.find((o) => o.label === label)?.color) ??
    hexFromStatusColor(STATUS_OPTIONS.find((o) => o.label === label)?.color) ??
    NEUTRAL;

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const todayStr = toDateOnly(now);
  const horizonStr = toDateOnly(addDaysOnly(now, DUE_SOON_DAYS - 1));

  const statusCounts = new Map<string, number>();
  const assigneeCounts = new Map<string, number>();
  const attention: AttentionTask[] = [];
  let done = 0, working = 0, stuck = 0, overdue = 0, dueSoon = 0, undated = 0;

  for (const item of items) {
    const status = firstStatusValue(board.columns || [], item.column_values);
    // An item with no status still exists; it is counted under one visible label
    // rather than silently dropped, which is what made the ring add up to less
    // than the task count.
    const label = status && status.trim() ? status : "Not Started";
    statusCounts.set(label, (statusCounts.get(label) || 0) + 1);

    const finished = isDoneStatusValue(status);
    if (finished) done++;
    else if (isStuckStatusValue(status)) stuck++;
    else if (isWorkingStatusValue(status)) working++;

    const assignee = assigneeIdOf(board, item);
    if (assignee) assigneeCounts.set(assignee, (assigneeCounts.get(assignee) || 0) + 1);

    const due = dueDateOf(board, item);
    if (!due) {
      undated++;
      continue;
    }
    if (finished) continue;

    // Compared as yyyy-MM-dd strings, which sort lexicographically and cannot
    // drift by a timezone the way two Date objects can.
    const dueStr = toDateOnly(due);
    const late = dueStr < todayStr;
    if (late) overdue++;
    else if (dueStr <= horizonStr) dueSoon++;

    if (late || dueStr <= horizonStr) {
      const group = groupById.get(item.group_id);
      attention.push({
        id: item.id,
        name: item.name,
        groupTitle: group?.title ?? "",
        groupColor: group?.color || NEUTRAL,
        ownerName: assignee
          ? profiles.find((p) => p.id === assignee)?.full_name ?? null
          : null,
        offsetDays: daysBetween(now, due),
      });
    }
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
      color: ASSIGNEE_BAR_COLOR,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  // Groups wear the colour the board gives them, so a bar and its group header
  // are recognisably the same thing.
  const byGroup: BarDatum[] = groups
    .map((g) => ({
      key: g.id,
      label: g.title,
      value: items.filter((i) => i.group_id === g.id).length,
      color: g.color || NEUTRAL,
    }))
    .filter((g) => g.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  attention.sort((a, b) => a.offsetDays - b.offsetDays || a.name.localeCompare(b.name));

  return {
    total, done, donePct: pct(done), working, stuck, overdue, dueSoon,
    statuses, byAssignee, byGroup,
    attention: attention.slice(0, ATTENTION_LIMIT),
    attentionTotal: attention.length,
    undated,
  };
}
