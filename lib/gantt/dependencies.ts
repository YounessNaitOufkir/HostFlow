/**
 * One edge list, from two places that both record dependencies.
 *
 * A dependency can live on the item's `dependency` column (an array of
 * predecessor ids) or as a row in `item_links`, and `DependencyCell` writes
 * both — non-transactionally, so they can and do drift. Every consumer used to
 * merge and de-duplicate them itself; the arrow layer did it inline and the
 * scheduler would have had to repeat it, with the two free to disagree about
 * what the plan is.
 */

import type { Board, DependencyType, Item, ItemLink } from "@/types";

export interface GanttDependency {
  id: string;
  /** The predecessor. */
  sourceId: string;
  /** The task that waits. */
  targetId: string;
  type: DependencyType;
  /** Days of delay (positive) or overlap (negative). */
  lag: number;
}

const VALID_TYPES: DependencyType[] = ["FS", "SS", "FF"];

/**
 * Every dependency among `items`, de-duplicated by (source, target).
 *
 * Rows written before link types existed have no `dep_type`; they were drawn as
 * finish-to-start and are read that way, so nothing about an existing plan
 * changes. Where a link row and a column entry describe the same pair, the link
 * row wins — it is the one that can carry a type and a lag.
 */
export function collectDependencies(
  items: Item[],
  boardsById: Map<string, Board>,
  itemLinks: ItemLink[]
): GanttDependency[] {
  const known = new Set(items.map((i) => i.id));
  const byPair = new Map<string, GanttDependency>();

  const add = (dep: GanttDependency, overwrite: boolean) => {
    if (dep.sourceId === dep.targetId) return;
    if (!known.has(dep.sourceId) || !known.has(dep.targetId)) return;
    const key = `${dep.sourceId}->${dep.targetId}`;
    if (!overwrite && byPair.has(key)) return;
    byPair.set(key, dep);
  };

  for (const item of items) {
    const board = boardsById.get(item.board_id);
    for (const column of board?.columns ?? []) {
      if (column.type !== "dependency") continue;
      for (const sourceId of parseDependencyCell(item.column_values?.[column.id])) {
        add(
          {
            id: `col-${sourceId}-${item.id}`,
            sourceId,
            targetId: item.id,
            type: "FS",
            lag: 0,
          },
          false
        );
      }
    }
  }

  for (const link of itemLinks) {
    if (link.link_type !== "dependency") continue;
    add(
      {
        id: link.id,
        sourceId: link.source_item_id,
        targetId: link.target_item_id,
        type: normalizeType(link.dep_type),
        lag: Number.isFinite(link.lag_days) ? Number(link.lag_days) : 0,
      },
      true
    );
  }

  return Array.from(byPair.values());
}

function normalizeType(value: unknown): DependencyType {
  return VALID_TYPES.includes(value as DependencyType) ? (value as DependencyType) : "FS";
}

/** A dependency cell holds an array of ids, sometimes still JSON-encoded in a string. */
export function parseDependencyCell(value: unknown): string[] {
  if (!value) return [];

  let parsed: unknown = value;
  if (typeof value === "string" && value.startsWith("[")) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [value];
    }
  }

  if (Array.isArray(parsed)) {
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  return typeof parsed === "string" && parsed ? [parsed] : [];
}
