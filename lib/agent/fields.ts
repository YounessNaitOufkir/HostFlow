import type { Column, StatusOption } from "@/types";
import { PRIORITY_OPTIONS } from "@/types";
import { statusOptionsOf } from "@/lib/doneLink";
import { withoutBlankOption } from "@/lib/cellDefaults";
import { parseDateOnly } from "@/lib/gantt/dates";
import { normalizeName, resolveStatusLabel, type Resolution } from "@/lib/agent/resolve";

/**
 * A board's columns as the connector describes and writes them.
 *
 * Pure. A value an assistant sends is checked against the column's type here,
 * before anything is written, so a bad value is refused with the format it
 * should have had - never stored as something the board cannot display.
 * People are the one type resolved elsewhere: they need the directory and an
 * access check, so this returns them as names/ids for the caller to settle.
 */

/** Types an assistant may not write in v2, with the reason it is told. */
const NOT_WRITABLE: Partial<Record<Column["type"], string>> = {
  formula: "is calculated by the board",
  files: "holds files, which an assistant cannot upload",
  dependency: "links tasks together; dependencies are edited in HostFlow",
  relation: "links to other boards; relations are edited in HostFlow",
};

export function writeRefusal(column: Column): string | null {
  const reason = NOT_WRITABLE[column.type];
  return reason ? `"${column.title}" ${reason}.` : null;
}

function priorityOptionsOf(column: Column): StatusOption[] {
  return column.settings?.priorityLabels?.length ? column.settings.priorityLabels : PRIORITY_OPTIONS;
}

export interface ColumnDescription {
  id: string;
  title: string;
  type: Column["type"];
  writable: boolean;
  /** The labels a status or priority column accepts. */
  options?: string[];
  /** What a value for this column looks like. */
  format: string;
}

const FORMATS: Record<Column["type"], string> = {
  status: "one of the options",
  priority: "one of the options",
  text: "text",
  numbers: "a number",
  date: "YYYY-MM-DD",
  timeline: '{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}',
  people: "person ids or names (array)",
  checkbox: "true or false",
  rating: "a whole number of stars",
  tags: "an array of words",
  link: '{"url":"https://…","label":"optional"}',
  files: "read only",
  formula: "read only",
  dependency: "read only",
  relation: "read only",
};

export function describeColumn(column: Column): ColumnDescription {
  const options =
    column.type === "status"
      ? withoutBlankOption(statusOptionsOf(column)).map((o) => o.label)
      : column.type === "priority"
        ? withoutBlankOption(priorityOptionsOf(column)).map((o) => o.label)
        : undefined;
  return {
    id: column.id,
    title: column.title,
    type: column.type,
    writable: writeRefusal(column) === null,
    ...(options ? { options } : {}),
    format: column.type === "rating" ? `0 to ${column.settings?.ratingMax ?? 5}` : FORMATS[column.type],
  };
}

/** A checked value ready to store, or people still to be resolved by the caller. */
export type FieldValue =
  | { kind: "value"; value: unknown }
  | { kind: "people"; wanted: string[] };

export class FieldError extends Error {
  constructor(message: string, readonly options: string[] = []) {
    super(message);
    this.name = "FieldError";
  }
}

function settleLabel(resolution: Resolution<string>, column: Column, asked: string): string {
  if (resolution.kind === "one") return resolution.value;
  throw new FieldError(
    resolution.kind === "many"
      ? `More than one option of "${column.title}" matches "${asked}". Ask which one.`
      : `"${column.title}" has no option "${asked}".`,
    resolution.options
  );
}

function checkDate(raw: unknown, column: Column, part?: string): string {
  if (typeof raw !== "string" || !parseDateOnly(raw)) {
    throw new FieldError(`"${column.title}"${part ? ` ${part}` : ""} needs a date as YYYY-MM-DD.`);
  }
  return raw.slice(0, 10);
}

/**
 * Check one value for one column. `null` clears a field (except a checkbox,
 * which is false). Throws FieldError with the expected format otherwise.
 */
export function parseFieldValue(column: Column, raw: unknown): FieldValue {
  const refusal = writeRefusal(column);
  if (refusal) throw new FieldError(refusal);
  const value = (v: unknown): FieldValue => ({ kind: "value", value: v });

  if (raw === null) return value(column.type === "checkbox" ? false : null);

  switch (column.type) {
    case "status": {
      if (typeof raw !== "string") throw new FieldError(`"${column.title}" needs one of its options.`);
      return value(settleLabel(resolveStatusLabel(column, raw), column, raw));
    }
    case "priority": {
      if (typeof raw !== "string") throw new FieldError(`"${column.title}" needs one of its options.`);
      const options = withoutBlankOption(priorityOptionsOf(column));
      const match = options.filter((o) => normalizeName(o.label) === normalizeName(raw));
      if (match.length === 1) return value(match[0].label);
      throw new FieldError(`"${column.title}" has no option "${raw}".`, options.map((o) => o.label));
    }
    case "text": {
      if (typeof raw !== "string") throw new FieldError(`"${column.title}" needs text.`);
      return value(raw);
    }
    case "numbers": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) throw new FieldError(`"${column.title}" needs a number.`);
      return value(n);
    }
    case "date":
      return value(checkDate(raw, column));
    case "timeline": {
      const r = raw as { start?: unknown; end?: unknown };
      if (typeof raw !== "object" || raw === null || (r.start === undefined && r.end === undefined)) {
        throw new FieldError(`"${column.title}" needs {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}.`);
      }
      let start = checkDate(r.start ?? r.end, column, "start");
      let end = checkDate(r.end ?? r.start, column, "end");
      if (end < start) [start, end] = [end, start];
      return value({ start, end });
    }
    case "checkbox": {
      if (typeof raw === "boolean") return value(raw);
      if (raw === "true" || raw === "false") return value(raw === "true");
      throw new FieldError(`"${column.title}" needs true or false.`);
    }
    case "rating": {
      const max = column.settings?.ratingMax ?? 5;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > max) throw new FieldError(`"${column.title}" needs a whole number from 0 to ${max}.`);
      return value(n);
    }
    case "tags": {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : null;
      if (!list || list.some((t) => typeof t !== "string")) throw new FieldError(`"${column.title}" needs a list of words.`);
      return value(Array.from(new Set(list.map((t) => (t as string).trim()).filter(Boolean))));
    }
    case "link": {
      const r = (typeof raw === "string" ? { url: raw } : raw) as { url?: unknown; label?: unknown };
      if (typeof r?.url !== "string" || !/^https?:\/\//i.test(r.url)) {
        throw new FieldError(`"${column.title}" needs a web address starting with http:// or https://.`);
      }
      return value({ url: r.url, ...(typeof r.label === "string" && r.label ? { label: r.label } : {}) });
    }
    case "people": {
      const list = Array.isArray(raw) ? raw : [raw];
      if (list.some((p) => typeof p !== "string" || !p.trim())) {
        throw new FieldError(`"${column.title}" needs person ids or names.`);
      }
      return { kind: "people", wanted: list as string[] };
    }
    default:
      throw new FieldError(`"${column.title}" cannot be written by an assistant.`);
  }
}

/**
 * The column a `fields` key names: its id, or its exact title (case and
 * accents aside) when only one column has it.
 */
export function findColumn(columns: Column[], key: string): Column {
  const byId = columns.find((c) => c.id === key);
  if (byId) return byId;
  const byTitle = columns.filter((c) => normalizeName(c.title) === normalizeName(key));
  if (byTitle.length === 1) return byTitle[0];
  throw new FieldError(
    byTitle.length > 1 ? `Several columns are called "${key}". Use the column id.` : `No column "${key}" on this board.`,
    (byTitle.length > 1 ? byTitle : columns).map((c) => `${c.title} (${c.id})`)
  );
}

/** A stored value as an assistant reads it: people as names, everything else as stored. */
export function readFieldValue(column: Column, value: unknown, names: Map<string, string>): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (column.type === "people") {
    let list = value;
    if (typeof list === "string" && list.startsWith("[")) {
      try {
        list = JSON.parse(list);
      } catch {
        /* keep the string */
      }
    }
    return Array.isArray(list)
      ? list.map((id) => ({ id, name: names.get(String(id)) ?? "Unknown" }))
      : value;
  }
  return value;
}
