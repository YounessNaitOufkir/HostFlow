/**
 * Which column means what, per board.
 *
 * A board's schema lives in a JSONB blob and every column is just a type plus a
 * title, so the chart has to work out for itself which one holds the dates it
 * should plot. It used to do that by walking the column list and taking the
 * first one that happened to have a value on the item in hand - which means a
 * board with both a "Site visit" date and a "Works" timeline plots whichever
 * the user happened to create first, and two items on the same board can end up
 * plotted from two different columns.
 *
 * On the Master Gantt it was worse: that view hands the chart a fabricated
 * board whose columns are the union of every selected board's, so the pick was
 * effectively arbitrary and every bar's status colour was read from whichever
 * board's palette landed first in the union.
 *
 * A board now says what it means, once, in `boards.gantt_config`, and the
 * Master Gantt resolves each item against its *own* board. Unset boards keep
 * today's behaviour through the fallbacks below.
 */

import type { Board, Column, GanttConfig, Item, StatusOption } from "@/types";
import { STATUS_OPTIONS } from "@/types";

export type { GanttConfig };

/** A board carrying its Gantt settings. `gantt_config` is absent on every board until one is saved. */
export type BoardWithGantt = Board & { gantt_config?: GanttConfig | null };

export const DEFAULT_LEFT_COLUMNS = ["name", "start", "finish", "duration"];

export function ganttConfigOf(board: Board | null | undefined): GanttConfig {
  return (board as BoardWithGantt | null | undefined)?.gantt_config ?? {};
}

/**
 * The column that drives a bar's position.
 *
 * Prefers the board's declared choice, then a timeline column, then a date
 * column. Timeline wins the fallback because it is the one the column menu
 * offers - `date` is hidden there - so a board that has both almost always
 * means the timeline.
 */
export function resolveTimelineColumn(board: Board | null | undefined): Column | null {
  if (!board?.columns?.length) return null;
  const config = ganttConfigOf(board);

  if (config.timelineColumnId) {
    const declared = board.columns.find(
      (c) =>
        c.id === config.timelineColumnId &&
        (c.type === "timeline" || c.type === "date")
    );
    if (declared) return declared;
    // Fall through when the declared column has since been deleted.
  }

  return (
    board.columns.find((c) => c.type === "timeline") ??
    board.columns.find((c) => c.type === "date") ??
    null
  );
}

/** Every column a bar could be plotted from, best first - used to fill gaps in the primary column. */
export function candidateDateColumns(board: Board | null | undefined): Column[] {
  if (!board?.columns?.length) return [];
  const primary = resolveTimelineColumn(board);
  const rest = board.columns.filter(
    (c) => (c.type === "timeline" || c.type === "date") && c.id !== primary?.id
  );
  return primary ? [primary, ...rest] : rest;
}

export function resolveStatusColumn(board: Board | null | undefined): Column | null {
  if (!board?.columns?.length) return null;
  const config = ganttConfigOf(board);
  if (config.statusColumnId) {
    const declared = board.columns.find(
      (c) => c.id === config.statusColumnId && c.type === "status"
    );
    if (declared) return declared;
  }
  return board.columns.find((c) => c.type === "status") ?? null;
}

export function resolveMilestoneColumn(board: Board | null | undefined): Column | null {
  const config = ganttConfigOf(board);
  if (!config.milestoneColumnId || !board?.columns?.length) return null;
  return (
    board.columns.find(
      (c) => c.id === config.milestoneColumnId && c.type === "checkbox"
    ) ?? null
  );
}

export const GANTT_DEFAULT_COLOR = "#579bfc";
export const GANTT_NEUTRAL_COLOR = "#c4c4c4";

/** Pull the hex out of a Tailwind class like `bg-[#fdab3d]`. Gradient labels have none. */
export function extractHex(bgClass: string | undefined): string {
  if (!bgClass) return GANTT_NEUTRAL_COLOR;
  const match = bgClass.match(/#[0-9a-fA-F]{3,8}/);
  return match ? match[0] : GANTT_NEUTRAL_COLOR;
}

/** The bar colour for an item's status, read from that item's own board palette. */
export function statusColorOf(board: Board | null | undefined, item: Item): string {
  const column = resolveStatusColumn(board);
  if (!column) return GANTT_NEUTRAL_COLOR;

  const value = item.column_values?.[column.id];
  if (typeof value !== "string" || !value) return GANTT_NEUTRAL_COLOR;

  const options: StatusOption[] = column.settings?.statusLabels ?? STATUS_OPTIONS;
  return extractHex(options.find((o) => o.label === value)?.color);
}
