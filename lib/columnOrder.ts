import type { Column } from "@/types";

/**
 * Per-user column order.
 *
 * Dragging a column header is a personal display preference, like hiding one,
 * so it is kept in this browser, keyed by board, and never written to
 * boards.columns. The board's own order stays the shared default that anyone
 * without a preference sees.
 */

/**
 * Applies a saved order to the board's columns.
 *
 * Columns the saved order does not know about (added by someone since) keep
 * their place relative to the shared order: each one follows the column it
 * follows on the board, instead of all piling up at the end. Ids in the saved
 * order that no longer exist are ignored.
 */
export function applyColumnOrder(columns: Column[], order: string[] | undefined): Column[] {
  if (!order || order.length === 0) return columns;

  const byId = new Map(columns.map((c) => [c.id, c]));
  const result: Column[] = order.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const placed = new Set(result.map((c) => c.id));

  columns.forEach((col, idx) => {
    if (placed.has(col.id)) return;
    // Nearest earlier column on the board that is already placed.
    let insertAt = 0;
    for (let i = idx - 1; i >= 0; i--) {
      const at = result.findIndex((c) => c.id === columns[i].id);
      if (at !== -1) {
        insertAt = at + 1;
        break;
      }
    }
    result.splice(insertAt, 0, col);
    placed.add(col.id);
  });

  return result;
}

/**
 * Moves a column, given drag indices counted among the VISIBLE columns, and
 * returns the full new order as ids.
 *
 * The header row only renders visible columns, so the drag indices skip hidden
 * ones. Applying them to the full list moved the wrong column whenever a hidden
 * column came first. Hidden columns keep their slots here; only the visible
 * ones are rearranged.
 */
export function moveVisibleColumn(
  ordered: Column[],
  hiddenIds: string[],
  startIndex: number,
  endIndex: number
): string[] {
  const hidden = new Set(hiddenIds);
  const visible = ordered.filter((c) => !hidden.has(c.id));
  if (startIndex < 0 || startIndex >= visible.length) return ordered.map((c) => c.id);

  const [moved] = visible.splice(startIndex, 1);
  visible.splice(Math.min(Math.max(endIndex, 0), visible.length), 0, moved);

  let v = 0;
  return ordered.map((c) => (hidden.has(c.id) ? c.id : visible[v++].id));
}
