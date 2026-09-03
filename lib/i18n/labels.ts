import type { TranslationKey } from "./types";

/**
 * Display names for the values HostFlow ships with.
 *
 * A status cell stores its label as its value: the string "Done" is both what
 * the database holds and what the dropdown wrote. So translating a status can
 * never mean translating what gets written - that would fracture the data by
 * whoever last edited it, and Kanban would grow a "Done" column beside a
 * "Terminé" one holding the same work. The stored value stays canonical and
 * only the rendering changes, so one board reads correctly to a French and an
 * English colleague at once.
 *
 * Which is why the lookup is keyed on the VALUE rather than on where the value
 * came from. Boards carry their own label sets (`column.settings.statusLabels`),
 * and a real board here already lists ["Fait", "En cours", "Bloqué", "En retard"].
 * Those are the user's own words: they match no key, fall through untouched, and
 * must keep doing so. Anything absent from these tables is data, not interface.
 */

type Translate = (key: TranslationKey) => string;

/** The labels in `STATUS_OPTIONS`. */
const STATUS_KEYS: Record<string, TranslationKey> = {
  "Working on it": "status.workingOnIt",
  "Done": "status.done",
  "Stuck": "status.stuck",
  "Not Started": "status.notStarted",
  "Overdue": "status.overdue",
};

/** The labels in `PRIORITY_OPTIONS`. */
const PRIORITY_KEYS: Record<string, TranslationKey> = {
  "Critical": "prio.critical",
  "High": "prio.high",
  "Medium": "prio.medium",
  "Low": "prio.low",
  "Empty": "prio.empty",
};

/**
 * Column titles HostFlow creates itself.
 *
 * Deliberately narrow. A title is stored text a user is free to rewrite, so
 * every entry here is a name the app wrote - the seven a new board is given,
 * plus the ones the importer and older boards produced. A column someone named
 * themselves ("Works", "Send to telegram") is their words and is left alone.
 */
const COLUMN_KEYS: Record<string, TranslationKey> = {
  "Status": "col.status",
  "Priority": "col.priority",
  "Timeline": "col.timeline",
  "Owner": "col.owner",
  "Assignee": "col.assignee",
  "Dependency": "col.dependency",
  "Depends on": "col.dependsOn",
  "Tag": "col.tag",
  "Tags": "col.tags",
  "Notes": "col.notes",
  "Date": "col.date",
  "Due Date": "col.dueDate",
  // The item-name column, which boards store as free text like any other.
  "Item Name": "col.itemName",
  "Item": "col.item",
  "Task": "col.task",
  "Name": "col.name",
  // The defaultTitle of every type in the "+ Add column" menu.
  "Text": "col.text",
  "Numbers": "col.numbers",
  "Files": "col.files",
  "Formula": "col.formula",
  "Done": "col.done",
  "Link": "col.link",
  "Rating": "col.rating",
  "Relation": "col.relation",
  "Button": "col.button",
};

function lookUp(
  table: Record<string, TranslationKey>,
  t: Translate,
  value: string | null | undefined,
): string {
  if (typeof value !== "string") return "";
  const key = table[value.trim()];
  return key ? t(key) : value;
}

/** A status value as it should read on screen. Unknown values pass through. */
export function displayStatus(t: Translate, value: string | null | undefined): string {
  return lookUp(STATUS_KEYS, t, value);
}

/** A priority value as it should read on screen. Unknown values pass through. */
export function displayPriority(t: Translate, value: string | null | undefined): string {
  return lookUp(PRIORITY_KEYS, t, value);
}

/** A column title as it should read on screen. A renamed column passes through. */
export function displayColumnTitle(t: Translate, title: string | null | undefined): string {
  return lookUp(COLUMN_KEYS, t, title);
}

/**
 * The right one of the two for a column, when the caller has the type to hand
 * but not which kind of label it is holding.
 */
export function displayCellLabel(
  t: Translate,
  columnType: string,
  value: string | null | undefined,
): string {
  if (columnType === "priority") return displayPriority(t, value);
  if (columnType === "status") return displayStatus(t, value);
  return typeof value === "string" ? value : "";
}
