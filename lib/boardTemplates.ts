import type { Column, ColumnType, Group, StatusOption } from "@/types";
import type { TranslationKey } from "@/lib/i18n";

/**
 * The starting points offered when someone creates a workspace.
 *
 * Defined here rather than seeded as rows in the database on purpose. A
 * template is product copy, not user data: keeping it in code means it is
 * translated through the same dictionary as the rest of the app, versioned with
 * the release that introduced it, and cannot be silently broken by somebody
 * editing the board it was copied from. lib/templateUtils.ts still exists for
 * duplicating a REAL board, which is a different job.
 *
 * Everything a template produces is materialised once, at creation time, in the
 * creator's language. After that it is ordinary board data and is never
 * re-translated — the same rule the rest of the app follows for anything a user
 * could have typed.
 */

/** Marks a row the template seeded, so "clear examples" can find them again. */
export const SAMPLE_MARKER = "__hostflow_sample";

export type TemplateId = "project" | "client" | "personal" | "blank";

/**
 * A cell value in a template row, described rather than literal.
 *
 * Dates are offsets from the day the board is created, so a fresh board always
 * straddles "today" and the Gantt and calendar views have something to show.
 */
export type TemplateValue =
  | { kind: "text"; key: TranslationKey }
  | { kind: "status"; key: TranslationKey }
  | { kind: "priority"; key: TranslationKey }
  | { kind: "number"; value: number }
  | { kind: "date"; dayOffset: number }
  | { kind: "timeline"; startOffset: number; endOffset: number }
  | { kind: "tags"; keys: TranslationKey[] };

interface TemplateColumnDef {
  /** Stable handle used by rows to address this column before it has a UUID. */
  ref: string;
  titleKey: TranslationKey;
  type: ColumnType;
  /** Attaches the translated label set for status/priority columns. */
  labels?: "status" | "priority";
  numberFormat?: "plain" | "currency" | "percent";
  currencySymbol?: string;
}

interface TemplateGroupDef {
  ref: string;
  titleKey: TranslationKey;
  color: string;
}

interface TemplateRowDef {
  group: string;
  nameKey: TranslationKey;
  values: Record<string, TemplateValue>;
}

export interface BoardTemplate {
  id: TemplateId;
  nameKey: TranslationKey;
  descKey: TranslationKey;
  /** Column types named on the tile, so the choice is legible before committing. */
  chips: TranslationKey[];
  columns: TemplateColumnDef[];
  groups: TemplateGroupDef[];
  rows: TemplateRowDef[];
}

const st = (key: TranslationKey): TemplateValue => ({ kind: "status", key });
const pr = (key: TranslationKey): TemplateValue => ({ kind: "priority", key });
const tl = (startOffset: number, endOffset: number): TemplateValue => ({
  kind: "timeline",
  startOffset,
  endOffset,
});
const dt = (dayOffset: number): TemplateValue => ({ kind: "date", dayOffset });
const num = (value: number): TemplateValue => ({ kind: "number", value });
const tx = (key: TranslationKey): TemplateValue => ({ kind: "text", key });

export const BOARD_TEMPLATES: BoardTemplate[] = [
  // ── Project plan ─────────────────────────────────────────────────────
  {
    id: "project",
    nameKey: "tpl.project.name",
    descKey: "tpl.project.desc",
    chips: ["coltype.timeline", "coltype.dependency", "coltype.status"],
    columns: [
      { ref: "timeline", titleKey: "col.timeline", type: "timeline" },
      { ref: "owner", titleKey: "col.assignee", type: "people" },
      { ref: "status", titleKey: "col.status", type: "status", labels: "status" },
      { ref: "dep", titleKey: "col.dependency", type: "dependency" },
      { ref: "prio", titleKey: "col.priority", type: "priority", labels: "priority" },
      { ref: "notes", titleKey: "col.notes", type: "text" },
    ],
    groups: [
      { ref: "planning", titleKey: "tpl.project.gPlanning", color: "#579bfc" },
      { ref: "progress", titleKey: "tpl.project.gProgress", color: "#fdab3d" },
      { ref: "done", titleKey: "tpl.project.gDone", color: "#00c875" },
    ],
    rows: [
      {
        group: "planning",
        nameKey: "tpl.project.r1",
        values: { timeline: tl(-4, 2), status: st("status.workingOnIt"), prio: pr("prio.high") },
      },
      {
        group: "planning",
        nameKey: "tpl.project.r2",
        values: { timeline: tl(3, 10), status: st("status.notStarted"), prio: pr("prio.medium") },
      },
      {
        group: "progress",
        nameKey: "tpl.project.r3",
        values: { timeline: tl(-1, 6), status: st("status.workingOnIt"), prio: pr("prio.critical") },
      },
      {
        group: "progress",
        nameKey: "tpl.project.r4",
        values: { timeline: tl(5, 14), status: st("status.notStarted"), prio: pr("prio.medium") },
      },
      {
        group: "progress",
        nameKey: "tpl.project.r5",
        values: { timeline: tl(2, 4), status: st("status.stuck"), prio: pr("prio.high"), notes: tx("tpl.project.n5") },
      },
      {
        group: "done",
        nameKey: "tpl.project.r6",
        values: { timeline: tl(-12, -6), status: st("status.done"), prio: pr("prio.medium") },
      },
    ],
  },

  // ── Client work ──────────────────────────────────────────────────────
  {
    id: "client",
    nameKey: "tpl.client.name",
    descKey: "tpl.client.desc",
    chips: ["coltype.files", "coltype.status", "coltype.timeline"],
    columns: [
      { ref: "timeline", titleKey: "col.timeline", type: "timeline" },
      { ref: "owner", titleKey: "col.assignee", type: "people" },
      { ref: "status", titleKey: "col.status", type: "status", labels: "status" },
      { ref: "prio", titleKey: "col.priority", type: "priority", labels: "priority" },
      { ref: "files", titleKey: "tpl.client.cFiles", type: "files" },
      { ref: "notes", titleKey: "col.notes", type: "text" },
    ],
    groups: [
      { ref: "discovery", titleKey: "tpl.client.gDiscovery", color: "#579bfc" },
      { ref: "production", titleKey: "tpl.client.gProduction", color: "#fdab3d" },
      { ref: "review", titleKey: "tpl.client.gReview", color: "#a25ddc" },
      { ref: "delivered", titleKey: "tpl.client.gDelivered", color: "#00c875" },
    ],
    rows: [
      {
        group: "discovery",
        nameKey: "tpl.client.r1",
        values: { timeline: tl(-6, -2), status: st("status.done"), prio: pr("prio.high") },
      },
      {
        group: "discovery",
        nameKey: "tpl.client.r2",
        values: { timeline: tl(-2, 3), status: st("status.workingOnIt"), prio: pr("prio.medium") },
      },
      {
        group: "production",
        nameKey: "tpl.client.r3",
        values: { timeline: tl(1, 9), status: st("status.workingOnIt"), prio: pr("prio.critical") },
      },
      {
        group: "review",
        nameKey: "tpl.client.r4",
        values: { timeline: tl(10, 13), status: st("status.notStarted"), prio: pr("prio.medium"), notes: tx("tpl.client.n4") },
      },
      {
        group: "delivered",
        nameKey: "tpl.client.r5",
        values: { timeline: tl(-16, -14), status: st("status.done"), prio: pr("prio.low") },
      },
    ],
  },

  // ── Personal tasks ───────────────────────────────────────────────────
  {
    id: "personal",
    nameKey: "tpl.personal.name",
    descKey: "tpl.personal.desc",
    chips: ["coltype.date", "coltype.priority"],
    columns: [
      { ref: "due", titleKey: "col.dueDate", type: "date" },
      { ref: "status", titleKey: "col.status", type: "status", labels: "status" },
      { ref: "prio", titleKey: "col.priority", type: "priority", labels: "priority" },
      { ref: "notes", titleKey: "col.notes", type: "text" },
    ],
    groups: [
      { ref: "week", titleKey: "tpl.personal.gWeek", color: "#fdab3d" },
      { ref: "later", titleKey: "tpl.personal.gLater", color: "#579bfc" },
      { ref: "done", titleKey: "tpl.personal.gDone", color: "#00c875" },
    ],
    rows: [
      { group: "week", nameKey: "tpl.personal.r1", values: { due: dt(1), status: st("status.notStarted"), prio: pr("prio.high") } },
      { group: "week", nameKey: "tpl.personal.r2", values: { due: dt(3), status: st("status.workingOnIt"), prio: pr("prio.medium") } },
      { group: "week", nameKey: "tpl.personal.r3", values: { due: dt(5), status: st("status.notStarted"), prio: pr("prio.low") } },
      { group: "later", nameKey: "tpl.personal.r4", values: { due: dt(18), status: st("status.notStarted"), prio: pr("prio.medium") } },
      { group: "done", nameKey: "tpl.personal.r5", values: { due: dt(-4), status: st("status.done"), prio: pr("prio.low") } },
    ],
  },

  // ── Blank ────────────────────────────────────────────────────────────
  {
    id: "blank",
    nameKey: "tpl.blank.name",
    descKey: "tpl.blank.desc",
    chips: ["tpl.blank.chip"],
    columns: [
      { ref: "timeline", titleKey: "col.timeline", type: "timeline" },
      { ref: "owner", titleKey: "col.assignee", type: "people" },
      { ref: "dep", titleKey: "col.dependency", type: "dependency" },
      { ref: "tags", titleKey: "col.tags", type: "tags" },
      { ref: "status", titleKey: "col.status", type: "status", labels: "status" },
      { ref: "prio", titleKey: "col.priority", type: "priority", labels: "priority" },
      { ref: "notes", titleKey: "col.notes", type: "text" },
    ],
    groups: [{ ref: "g1", titleKey: "tpl.blank.group", color: "#579bfc" }],
    rows: [],
  },
];

export function getTemplate(id: TemplateId): BoardTemplate {
  const found = BOARD_TEMPLATES.find((tpl) => tpl.id === id);
  if (!found) throw new Error(`Unknown board template: ${id}`);
  return found;
}

type Translate = (key: TranslationKey) => string;

/** Local calendar date, offset by whole days, as the YYYY-MM-DD the cells store. */
function isoDay(dayOffset: number, today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Declared meanings for the status labels a template board ships with.
 *
 * Worth setting rather than leaving to the fallback: without `semantic`, the
 * overdue rule and the dashboard have to match the label against a list of
 * English words, which reads "Terminé" as unfinished. See StatusSemantic.
 */
function statusLabels(t: Translate): StatusOption[] {
  return [
    { label: t("status.notStarted"), color: "bg-[#c4c4c4]", semantic: "idle" },
    { label: t("status.workingOnIt"), color: "bg-[#fdab3d]", semantic: "working" },
    { label: t("status.stuck"), color: "bg-[#e2445c]", semantic: "stuck" },
    { label: t("status.done"), color: "bg-[#00c875]", semantic: "done" },
  ];
}

function priorityLabels(t: Translate): StatusOption[] {
  return [
    { label: t("prio.critical"), color: "bg-gray-900" },
    { label: t("prio.high"), color: "bg-[#e2445c]" },
    { label: t("prio.medium"), color: "bg-[#a25ddc]" },
    { label: t("prio.low"), color: "bg-[#579bfc]" },
  ];
}

export interface BuiltBoard {
  columns: Column[];
  groups: Omit<Group, "board_id">[];
  items: {
    id: string;
    groupId: string;
    name: string;
    position: number;
    column_values: Record<string, unknown>;
  }[];
}

/**
 * Turns a template into rows ready to insert, in the caller's language.
 *
 * Column ids are fresh UUIDs, generated the same way the importer and the
 * blank-board path do: two boards built from fixed string ids would share
 * column ids, and automations match on those.
 */
export function buildBoardFromTemplate(
  template: BoardTemplate,
  t: Translate,
  today: Date = new Date()
): BuiltBoard {
  const columnIds = new Map<string, string>();
  const columns: Column[] = template.columns.map((def) => {
    const id = crypto.randomUUID();
    columnIds.set(def.ref, id);
    const column: Column = { id, title: t(def.titleKey), type: def.type };
    if (def.labels === "status") column.settings = { statusLabels: statusLabels(t) };
    if (def.labels === "priority") column.settings = { priorityLabels: priorityLabels(t) };
    if (def.numberFormat) {
      column.settings = {
        ...column.settings,
        numberFormat: def.numberFormat,
        ...(def.currencySymbol ? { currencySymbol: def.currencySymbol } : {}),
      };
    }
    return column;
  });

  const groupIds = new Map<string, string>();
  const groups = template.groups.map((def, index) => {
    const id = crypto.randomUUID();
    groupIds.set(def.ref, id);
    return { id, title: t(def.titleKey), color: def.color, position: index };
  });

  const perGroupPosition = new Map<string, number>();
  const items = template.rows.map((row) => {
    const groupId = groupIds.get(row.group);
    if (!groupId) throw new Error(`Template ${template.id}: row references unknown group ${row.group}`);
    const position = perGroupPosition.get(groupId) ?? 0;
    perGroupPosition.set(groupId, position + 1);

    const column_values: Record<string, unknown> = { [SAMPLE_MARKER]: true };
    for (const [ref, value] of Object.entries(row.values)) {
      const columnId = columnIds.get(ref);
      if (!columnId) throw new Error(`Template ${template.id}: row references unknown column ${ref}`);
      column_values[columnId] = resolveValue(value, t, today);
    }

    return { id: crypto.randomUUID(), groupId, name: t(row.nameKey), position, column_values };
  });

  return { columns, groups, items };
}

function resolveValue(value: TemplateValue, t: Translate, today: Date): unknown {
  switch (value.kind) {
    case "text":
    case "status":
    case "priority":
      return t(value.key);
    case "number":
      return value.value;
    case "date":
      return isoDay(value.dayOffset, today);
    case "timeline":
      return { start: isoDay(value.startOffset, today), end: isoDay(value.endOffset, today) };
    case "tags":
      return value.keys.map((key) => t(key));
  }
}
