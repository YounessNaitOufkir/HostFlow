/**
 * The flat row model both Gantt surfaces render.
 *
 * Rows are laid out once, here, with their `y` and `height` baked in. The old
 * chart instead recomputed a row's y inside the dependency-arrow layer by
 * summing the heights of every row above it - once per endpoint, per arrow -
 * which is O(n^2) on exactly the boards big enough to need arrows. It also
 * hands back an id-keyed index so the arrow layer can find a bar in one lookup
 * instead of scanning the row list twice per link.
 *
 * Three levels. The board Gantt uses the bottom two (group, item); the Master
 * Gantt turns on the project level so each board becomes its own swimlane.
 */

import type { Board, Group, Item, Profile } from "@/types";
import { parseDateOnly } from "./dates";
import {
  candidateDateColumns,
  resolveMilestoneColumn,
  statusColorOf,
  GANTT_DEFAULT_COLOR,
} from "./config";

export const GANTT_ROW_HEIGHTS = {
  project: 48,
  group: 40,
  item: 60,
} as const;

export type GanttRowKind = keyof typeof GANTT_ROW_HEIGHTS;

/** The row-size choice in the Gantt view menu; a per-user preference. */
export type GanttRowSize = "compact" | "default" | "comfortable";
export const GANTT_ROW_SIZES = ["compact", "default", "comfortable"] as const;

/** Row heights per size. "comfortable" is what every Gantt used before the choice existed. */
export const GANTT_ROW_SIZE_HEIGHTS: Record<GanttRowSize, Record<GanttRowKind, number>> = {
  compact: { project: 36, group: 30, item: 36 },
  default: { project: 44, group: 36, item: 48 },
  comfortable: GANTT_ROW_HEIGHTS,
};

/** Task bar height inside a row of this size. */
export const GANTT_BAR_HEIGHTS: Record<GanttRowSize, number> = {
  compact: 18,
  default: 22,
  comfortable: 22,
};

interface RowBase {
  id: string;
  kind: GanttRowKind;
  /** Indent level: 0 for the outermost row present in this chart. */
  depth: number;
  y: number;
  height: number;
  start: Date;
  end: Date;
  color: string;
  label: string;
  collapsed: boolean;
}

export interface GanttProjectRow extends RowBase {
  kind: "project";
  board: Board;
  /** "Résidence Alpha › Lancement" - board names repeat across workspaces, so the name alone identifies nothing. */
  workspaceName?: string;
  itemCount: number;
}

export interface GanttGroupRow extends RowBase {
  kind: "group";
  group: Group;
  board: Board;
  itemCount: number;
}

export interface GanttItemRow extends RowBase {
  kind: "item";
  item: Item;
  board: Board;
  group: Group;
  /** The column this bar was plotted from - what a drag writes back to. */
  columnId: string;
  colType: "date" | "timeline";
  isMilestone: boolean;
  statusColor: string;
  groupColor: string;
  assigneeNames: string;
  /** The agreed plan for this task, when one has been captured. */
  baseline: { start: Date; end: Date } | null;
}

export type GanttRow = GanttProjectRow | GanttGroupRow | GanttItemRow;

/** One board's slice of the chart. The Master Gantt passes many; the board Gantt passes one. */
export interface GanttBoardContext {
  board: Board;
  workspaceName?: string;
  groups: Group[];
  items: Item[];
}

export interface BuildRowsOptions {
  contexts: GanttBoardContext[];
  /** Ids of collapsed project and group rows. */
  collapsed?: Set<string> | string[];
  profiles?: Profile[];
  /** Master Gantt: emit a swimlane header per board. */
  showProjectRows?: boolean;
  /** Row heights to lay out with; defaults to GANTT_ROW_HEIGHTS. */
  heights?: Record<GanttRowKind, number>;
}

export interface GanttRowModel {
  rows: GanttRow[];
  /** Item rows only, in render order - the input to scheduling and arrow drawing. */
  itemRows: GanttItemRow[];
  /** Every plotted item by item id, including ones hidden inside a collapsed parent. */
  byItemId: Map<string, GanttItemRow>;
  totalHeight: number;
  starts: Date[];
  ends: Date[];
}

export function projectRowId(boardId: string): string {
  return "project-" + boardId;
}

export function groupRowId(groupId: string): string {
  return "group-" + groupId;
}

interface PlottedDates {
  start: Date;
  end: Date;
  columnId: string;
  colType: "date" | "timeline";
}

/**
 * Where an item sits on the timeline, or null if it carries no usable date.
 *
 * Tries the board's declared timeline column first and only falls back to its
 * other date columns when that one is empty, so a board plots from one column
 * unless it has no choice.
 */
export function plotItemDates(item: Item, board: Board): PlottedDates | null {
  for (const col of candidateDateColumns(board)) {
    const value = item.column_values?.[col.id];
    if (!value) continue;

    if (col.type === "date") {
      const d = parseDateOnly(value);
      if (d) return { start: d, end: d, columnId: col.id, colType: "date" };
      continue;
    }

    if (col.type === "timeline" && typeof value === "object") {
      const start = parseDateOnly(value.start);
      if (!start) continue;
      // A timeline with only a start is a point in time, not a reason to skip the row.
      const end = parseDateOnly(value.end) ?? start;
      return {
        start,
        end: end < start ? start : end,
        columnId: col.id,
        colType: "timeline",
      };
    }
  }
  return null;
}

/** Profile IDs across every people column, which may arrive as an array or as JSON in a string. */
export function assigneeIdsOf(item: Item, board: Board): string[] {
  const ids: string[] = [];
  for (const col of board.columns ?? []) {
    if (col.type !== "people") continue;
    let value = item.column_values?.[col.id];
    if (!value) continue;
    if (typeof value === "string" && value.startsWith("[")) {
      try {
        value = JSON.parse(value);
      } catch {
        /* leave it as the string below */
      }
    }
    if (Array.isArray(value)) {
      ids.push(...value.filter((v): v is string => typeof v === "string"));
    } else if (typeof value === "string") {
      ids.push(value);
    }
  }
  return Array.from(new Set(ids));
}

function assigneeNamesOf(item: Item, board: Board, profiles?: Profile[]): string {
  if (!profiles?.length) return "";
  const names = assigneeIdsOf(item, board)
    .map((id) => profiles.find((p) => p.id === id)?.full_name)
    .filter((n): n is string => !!n);
  return Array.from(new Set(names)).join(", ");
}

/** The captured plan, ignored unless both ends parse. */
function baselineOf(item: Item): { start: Date; end: Date } | null {
  const start = parseDateOnly(item.baseline?.start);
  const end = parseDateOnly(item.baseline?.end);
  return start && end ? { start, end: end < start ? start : end } : null;
}

/**
 * Only a task ticked in the board's declared milestone checkbox is a milestone.
 * A one-day timeline used to count as one automatically, but on these boards a
 * one-day task is ordinary work (a delivery, a visit) and read as a diamond it
 * looked like a marker rather than a task that fills its day.
 */
function isMilestone(item: Item, board: Board): boolean {
  const column = resolveMilestoneColumn(board);
  return !!column && item.column_values?.[column.id] === true;
}

export function buildGanttRows({
  contexts,
  collapsed,
  profiles,
  showProjectRows = false,
  heights = GANTT_ROW_HEIGHTS,
}: BuildRowsOptions): GanttRowModel {
  const collapsedSet =
    collapsed instanceof Set ? collapsed : new Set(collapsed ?? []);

  const rows: GanttRow[] = [];
  const itemRows: GanttItemRow[] = [];
  const byItemId = new Map<string, GanttItemRow>();
  const starts: Date[] = [];
  const ends: Date[] = [];

  const baseDepth = showProjectRows ? 1 : 0;

  for (const context of contexts) {
    const { board, groups, items, workspaceName } = context;

    const projectRowIdValue = projectRowId(board.id);
    const projectCollapsed = collapsedSet.has(projectRowIdValue);

    // Build this board's groups first so the project header can roll them up.
    const pending: { group: GanttGroupRow; items: GanttItemRow[] }[] = [];
    let projectStart: Date | null = null;
    let projectEnd: Date | null = null;
    let projectItemCount = 0;

    const sortedGroups = [...groups].sort((a, b) => a.position - b.position);

    for (const group of sortedGroups) {
      const groupItems = items
        .filter((i) => i.group_id === group.id)
        .sort((a, b) => a.position - b.position);

      let groupStart: Date | null = null;
      let groupEnd: Date | null = null;
      const plottedRows: GanttItemRow[] = [];

      for (const item of groupItems) {
        const plotted = plotItemDates(item, board);
        if (!plotted) continue;

        const groupColor = group.color || GANTT_DEFAULT_COLOR;
        const row: GanttItemRow = {
          id: item.id,
          kind: "item",
          depth: baseDepth + 1,
          y: 0,
          height: heights.item,
          start: plotted.start,
          end: plotted.end,
          color: groupColor,
          label: item.name,
          collapsed: false,
          item,
          board,
          group,
          columnId: plotted.columnId,
          colType: plotted.colType,
          isMilestone: isMilestone(item, board),
          statusColor: statusColorOf(board, item),
          groupColor,
          assigneeNames: assigneeNamesOf(item, board, profiles),
          baseline: baselineOf(item),
        };

        plottedRows.push(row);
        byItemId.set(item.id, row);
        starts.push(plotted.start);
        ends.push(plotted.end);

        if (!groupStart || plotted.start < groupStart) groupStart = plotted.start;
        if (!groupEnd || plotted.end > groupEnd) groupEnd = plotted.end;
      }

      // An empty group contributes nothing to a chart of dates.
      if (!plottedRows.length || !groupStart || !groupEnd) continue;

      if (!projectStart || groupStart < projectStart) projectStart = groupStart;
      if (!projectEnd || groupEnd > projectEnd) projectEnd = groupEnd;
      projectItemCount += plottedRows.length;

      pending.push({
        group: {
          id: groupRowId(group.id),
          kind: "group",
          depth: baseDepth,
          y: 0,
          height: heights.group,
          start: groupStart,
          end: groupEnd,
          color: group.color || GANTT_DEFAULT_COLOR,
          label: group.title,
          collapsed: collapsedSet.has(group.id),
          group,
          board,
          itemCount: plottedRows.length,
        },
        items: plottedRows,
      });
    }

    if (!pending.length) continue;

    if (showProjectRows && projectStart && projectEnd) {
      rows.push({
        id: projectRowIdValue,
        kind: "project",
        depth: 0,
        y: 0,
        height: heights.project,
        start: projectStart,
        end: projectEnd,
        color: GANTT_DEFAULT_COLOR,
        label: board.name,
        collapsed: projectCollapsed,
        board,
        workspaceName,
        itemCount: projectItemCount,
      });
    }

    if (showProjectRows && projectCollapsed) continue;

    for (const { group, items: groupItemRows } of pending) {
      rows.push(group);
      if (group.collapsed) continue;
      for (const row of groupItemRows) {
        rows.push(row);
        itemRows.push(row);
      }
    }
  }

  let y = 0;
  for (const row of rows) {
    row.y = y;
    y += row.height;
  }

  return { rows, itemRows, byItemId, totalHeight: y, starts, ends };
}

/** Vertical centre of a row - where a bar sits and where an arrow attaches. */
export function rowCenterY(row: GanttRow): number {
  return row.y + row.height / 2;
}
