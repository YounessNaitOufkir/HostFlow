import type { Board, Column, StatusOption } from "@/types";
import { STATUS_OPTIONS } from "@/types";
import { statusSemanticOf } from "@/lib/statusSemantics";

/**
 * A "Done" checkbox and the task's status, kept in step.
 *
 * Ticking a checkbox column that marks tasks done sets the status to the
 * board's own "done" label (Done, Fait...) and remembers what it was; unticking
 * puts that back. The other way round, setting the status to done ticks the
 * box, and moving it off done unticks it.
 *
 * Which checkbox columns count: the ones switched on in the column's menu
 * (settings.marksDone), and, until someone decides either way, one named
 * "Done", "Fait" or "Terminé" - so the board's existing "Done ?" column works
 * without anyone having to find a setting. A milestone column never counts by
 * name: ticking a milestone is not finishing the task.
 */

/**
 * The status a task had before it was ticked done, kept with its values. The
 * leading underscores keep it out of every column: nothing looks a column up
 * by this name. (The same pattern as lib/boardTemplates' SAMPLE_MARKER.)
 */
export const STATUS_BEFORE_DONE = "__statusBeforeDone";

const DONE_TITLE = /^\s*(done|fait|termin[ée]e?|finished|completed?)\s*\??\s*$/i;

export function statusOptionsOf(column: Column): StatusOption[] {
  return column.settings?.statusLabels?.length ? column.settings.statusLabels : STATUS_OPTIONS;
}

/** The board's status column. Every board has at most one. */
export function statusColumnOf(board: Pick<Board, "columns">): Column | null {
  return board.columns?.find((c) => c.type === "status") ?? null;
}

/** The label that means finished on this status column: declared first, then recognised by name. */
export function doneLabelOf(statusColumn: Column): string | null {
  const options = statusOptionsOf(statusColumn);
  return (
    options.find((o) => o.semantic === "done")?.label ??
    options.find((o) => statusSemanticOf(o.label, options) === "done")?.label ??
    null
  );
}

/** Where a task goes back to when unticked and what it was is unknown. */
export function workingLabelOf(statusColumn: Column): string | null {
  const options = statusOptionsOf(statusColumn);
  return (
    options.find((o) => o.semantic === "working")?.label ??
    options.find((o) => statusSemanticOf(o.label, options) === "working")?.label ??
    null
  );
}

/** Whether ticking this checkbox column marks the task done. */
export function marksDone(column: Column, board: Pick<Board, "gantt_config">): boolean {
  if (column.type !== "checkbox") return false;
  if (typeof column.settings?.marksDone === "boolean") return column.settings.marksDone;
  if (board.gantt_config?.milestoneColumnId === column.id) return false;
  return DONE_TITLE.test(column.title ?? "");
}

export type DoneLinkAvailability = "ok" | "noStatus" | "noDoneLabel";

/** Whether this board can link a checkbox to its status at all. */
export function doneLinkAvailability(board: Pick<Board, "columns">): DoneLinkAvailability {
  const status = statusColumnOf(board);
  if (!status) return "noStatus";
  return doneLabelOf(status) ? "ok" : "noDoneLabel";
}

function isChecked(value: unknown): boolean {
  return value === true || value === "true";
}

export interface DoneLinkResult {
  /** The task's values with the edit and everything it brings along. */
  values: Record<string, unknown>;
  /** The status change a ticked or unticked box made, for automations and the history. */
  statusChange: { columnId: string; from: unknown; to: unknown } | null;
}

/**
 * Applies one cell edit, and the other side of the done link if it has one.
 * `values` is the task's values before the edit; it is not changed.
 */
export function applyDoneLink(
  board: Pick<Board, "columns" | "gantt_config">,
  values: Record<string, unknown>,
  columnId: string,
  newValue: unknown
): DoneLinkResult {
  const next: Record<string, unknown> = { ...values, [columnId]: newValue };
  const unchanged: DoneLinkResult = { values: next, statusChange: null };

  const status = statusColumnOf(board);
  const doneLabel = status ? doneLabelOf(status) : null;
  if (!status || !doneLabel) return unchanged;

  const boxes = (board.columns ?? []).filter((c) => marksDone(c, board));
  if (boxes.length === 0) return unchanged;

  const options = statusOptionsOf(status);
  const isDone = (v: unknown) => statusSemanticOf(v, options) === "done";
  const edited = board.columns?.find((c) => c.id === columnId);
  const current = values[status.id];

  // A done checkbox was ticked or unticked.
  if (edited && boxes.some((b) => b.id === edited.id)) {
    const checked = isChecked(newValue);
    // Every done box shows the same thing.
    for (const box of boxes) next[box.id] = checked;

    if (checked) {
      if (isDone(current)) return { values: next, statusChange: null };
      // What it was, "" included: a task with no status goes back to none.
      next[STATUS_BEFORE_DONE] = typeof current === "string" ? current : "";
      next[status.id] = doneLabel;
      return { values: next, statusChange: { columnId: status.id, from: current, to: doneLabel } };
    }

    if (!isDone(current)) {
      delete next[STATUS_BEFORE_DONE];
      return { values: next, statusChange: null };
    }
    const remembered = values[STATUS_BEFORE_DONE];
    const restore =
      typeof remembered === "string" && !isDone(remembered)
        ? remembered
        : workingLabelOf(status) ?? "";
    next[status.id] = restore;
    delete next[STATUS_BEFORE_DONE];
    return { values: next, statusChange: { columnId: status.id, from: current, to: restore } };
  }

  // The status itself was changed: the boxes follow.
  if (columnId === status.id) {
    const was = isDone(current);
    const now = isDone(newValue);
    if (now && !was) {
      for (const box of boxes) next[box.id] = true;
      next[STATUS_BEFORE_DONE] = typeof current === "string" ? current : "";
    } else if (!now && was) {
      for (const box of boxes) next[box.id] = false;
      delete next[STATUS_BEFORE_DONE];
    }
  }
  return unchanged;
}
