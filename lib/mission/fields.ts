import type { Board, Column, Item, WaitingOnValue } from "@/types";
import { parseDateOnly, toDateOnly } from "@/lib/gantt/dates";
import { itemIsDone } from "@/lib/statusSemantics";

/**
 * The two Pilotage fields, read off `column_values`.
 *
 * Pure, and forgiving by design: a cell can hold anything an import, an older
 * client or an assistant once wrote. Anything that is not a usable value reads
 * as "nothing" - never as an exception that takes the whole view down.
 */

/** A stored date as "yyyy-MM-dd", or null when it is not a real calendar date. */
function dateOnly(value: unknown): string | null {
  const d = parseDateOnly(value);
  return d ? toDateOnly(d) : null;
}

/**
 * A `waiting_on` cell as a value, or null when it is empty or malformed.
 * `who` and `since` are required; a bad `followUp` is dropped, not fatal.
 */
export function parseWaitingOn(value: unknown): WaitingOnValue | null {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const r = raw as { who?: unknown; since?: unknown; followUp?: unknown };
  if (typeof r.who !== "string") return null;
  const who = r.who.trim();
  if (!who) return null;

  const since = dateOnly(r.since);
  if (!since) return null;

  return { who, since, followUp: dateOnly(r.followUp) };
}

/** The first `waiting_on` column on the board that holds a valid value, with that value. */
export function waitingOnCellOf(item: Item, board: Board): { column: Column; value: WaitingOnValue } | null {
  for (const column of board.columns) {
    if (column.type !== "waiting_on") continue;
    const value = parseWaitingOn(item.column_values?.[column.id]);
    if (value) return { column, value };
  }
  return null;
}

/** What the item is waiting on: the first valid `waiting_on` cell. */
export function waitingOnOf(item: Item, board: Board): WaitingOnValue | null {
  return waitingOnCellOf(item, board)?.value ?? null;
}

/** Still to do: neither in the trash nor marked done. Nothing else counts in Pilotage. */
export function isOpenItem(item: Item, board: Board | undefined): boolean {
  return !!board && !item.deleted_at && !itemIsDone(board.columns ?? [], item.column_values);
}

/** True when any `on_site` column on the board is ticked for this item. */
export function isOnSite(item: Item, board: Board): boolean {
  return board.columns.some((c) => c.type === "on_site" && item.column_values?.[c.id] === true);
}
