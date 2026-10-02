import type { Column } from "@/types";

/**
 * Default values for Status and Priority.
 *
 * A task starts as "Not Started" and "Low" rather than blank. Labels are per
 * column (the French board says "Non commencé" / "Basse"), so the default is
 * looked up in the column's own options; a column with none of the expected
 * labels gets no default rather than one it does not offer.
 *
 * The database applies the same rule in public.cell_default_label() (migration
 * 20261002000000_status_priority_defaults.sql) so every insert path gets it,
 * not only the ones that go through this file. Keep the two in step.
 */

const IDLE_STATUS = /^(not started|non commencé|non commence)$/i;
const LOW_PRIORITY = /^(low|basse)$/i;

/** True for the values that mean "nothing chosen". */
export function isBlankCellValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" || value === "Empty";
}

/** The label a new task gets in this column, or null when it has no default. */
export function defaultCellLabel(column: Column): string | null {
  if (column.type === "status") {
    const labels = column.settings?.statusLabels;
    if (!labels || labels.length === 0) return "Not Started";
    return labels.find((l) => l.semantic === "idle" || IDLE_STATUS.test(l.label))?.label ?? null;
  }
  if (column.type === "priority") {
    const labels = column.settings?.priorityLabels;
    if (!labels || labels.length === 0) return "Low";
    return labels.find((l) => LOW_PRIORITY.test(l.label))?.label ?? null;
  }
  return null;
}

/** Fills every blank Status / Priority cell with its column's default. */
export function withCellDefaults<T extends Record<string, unknown>>(
  columns: Column[] | null | undefined,
  values: T
): T {
  let next: Record<string, unknown> | null = null;
  for (const col of columns ?? []) {
    if (col.type !== "status" && col.type !== "priority") continue;
    if (!isBlankCellValue(values[col.id])) continue;
    const label = defaultCellLabel(col);
    if (label === null) continue;
    next = next ?? { ...values };
    next[col.id] = label;
  }
  return (next ?? values) as T;
}

/** A column's options without the blank "Empty" choice. */
export function withoutBlankOption<T extends { label: string }>(options: T[]): T[] {
  return options.filter((o) => !isBlankCellValue(o.label));
}
