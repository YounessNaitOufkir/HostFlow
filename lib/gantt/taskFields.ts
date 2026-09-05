/**
 * The columns of the task table beside the chart.
 *
 * The pane used to show a name and a date range and nothing else, with no way
 * to change that. Every planning tool puts a real table here, because the
 * numbers people argue about — how long a task takes, what it is waiting on,
 * how much room it has — are read from the table, not measured off the bars.
 */

import { format } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns";
import type { TranslationKey } from "@/lib/i18n";
import type { GanttRow } from "./rows";
import type { TaskSchedule } from "./schedule";
import type { GanttDependency } from "./dependencies";
import { daysBetween } from "./dates";

export type GanttFieldKey =
  | "name"
  | "start"
  | "finish"
  | "duration"
  | "float"
  | "predecessors";

export interface GanttFieldContext {
  schedule?: TaskSchedule;
  dependencies: GanttDependency[];
  nameById: Map<string, string>;
  /** Translator, so a cell can say "loop" in the reader's language. */
  t: (key: TranslationKey) => string;
  /** Month names in the reader's language rather than always English. */
  dateLocale?: DateFnsLocale;
}

export interface GanttFieldDefinition {
  key: GanttFieldKey;
  labelKey: TranslationKey;
  /** Fixed width in px. `name` is the one that takes the remaining space. */
  width: number;
  align: "left" | "right";
  /** Numbers line up only if they are tabular. */
  numeric?: boolean;
  value: (row: GanttRow, context: GanttFieldContext) => string;
}

export const GANTT_FIELD_ORDER: GanttFieldKey[] = [
  "name",
  "start",
  "finish",
  "duration",
  "float",
  "predecessors",
];

const NAME_MIN_WIDTH = 140;

export const GANTT_FIELDS: Record<GanttFieldKey, GanttFieldDefinition> = {
  name: {
    key: "name",
    labelKey: "gantt.field.name",
    width: NAME_MIN_WIDTH,
    align: "left",
    value: (row) =>
      row.kind === "project" && row.workspaceName
        ? `${row.workspaceName} › ${row.label}`
        : row.label,
  },
  start: {
    key: "start",
    labelKey: "gantt.field.start",
    width: 78,
    align: "left",
    numeric: true,
    value: (row, { dateLocale }) => format(row.start, "d MMM yy", { locale: dateLocale }),
  },
  finish: {
    key: "finish",
    labelKey: "gantt.field.finish",
    width: 78,
    align: "left",
    numeric: true,
    value: (row, { dateLocale }) => format(row.end, "d MMM yy", { locale: dateLocale }),
  },
  duration: {
    key: "duration",
    labelKey: "gantt.field.duration",
    // Sized for the longest label across languages, not just "Days": French
    // renders "JOURS", which truncated to "JOU…" at 52.
    width: 62,
    align: "right",
    numeric: true,
    value: (row) => String(daysBetween(row.start, row.end) + 1),
  },
  float: {
    key: "float",
    labelKey: "gantt.field.float",
    width: 56,
    align: "right",
    numeric: true,
    value: (row, { schedule, t }) => {
      if (row.kind !== "item" || !schedule) return "";
      if (schedule.inCycle) return t("gantt.field.loop");
      return schedule.totalFloat <= 0 ? "0" : String(schedule.totalFloat);
    },
  },
  predecessors: {
    key: "predecessors",
    labelKey: "gantt.field.predecessors",
    width: 150,
    align: "left",
    value: (row, { dependencies, nameById }) => {
      if (row.kind !== "item") return "";
      return dependencies
        .filter((d) => d.targetId === row.item.id)
        .map((d) => {
          const name = nameById.get(d.sourceId) ?? "—";
          const lag = d.lag === 0 ? "" : d.lag > 0 ? ` +${d.lag}d` : ` ${d.lag}d`;
          // The type is only worth printing when it is not the ordinary one.
          return d.type === "FS" && !lag ? name : `${name} (${d.type}${lag})`;
        })
        .join(", ");
    },
  },
};

export const DEFAULT_GANTT_FIELDS: GanttFieldKey[] = [
  "name",
  "start",
  "finish",
  "duration",
];

/**
 * Drop anything unrecognised, always keep the name, and put the columns in a
 * fixed order.
 *
 * Ordering here rather than by when each was ticked means the table always
 * reads task, dates, duration, slack, predecessors - so turning a column on
 * puts it where the menu implies, not on the end.
 */
export function normalizeFields(keys: readonly string[] | undefined): GanttFieldKey[] {
  const chosen = new Set(
    (keys ?? []).filter((k): k is GanttFieldKey => k in GANTT_FIELDS)
  );
  if (chosen.size === 0) return [...DEFAULT_GANTT_FIELDS];
  chosen.add("name");
  return GANTT_FIELD_ORDER.filter((key) => chosen.has(key));
}

/** How wide the pane needs to be for a given set of columns. */
export function fieldsWidth(keys: GanttFieldKey[]): number {
  return keys.reduce((sum, key) => sum + GANTT_FIELDS[key].width, 0);
}

/**
 * The narrowest the pane can be before the name column stops being readable.
 *
 * Turning on a column has to widen the pane, not squeeze the task names into
 * an ellipsis - the name is the only thing that says which row you are reading.
 */
export function minPaneWidth(keys: GanttFieldKey[]): number {
  return fieldsWidth(keys) - GANTT_FIELDS.name.width + NAME_MIN_WIDTH;
}
