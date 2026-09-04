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

/**
 * A name is looked up however it is spelled and in whichever language it was
 * stored: lower-cased, trimmed, and with accents removed.
 *
 * The accents matter because the same import has produced both "Priorité" and
 * "Priorite" over the years, and a table keyed on the exact string quietly
 * misses one of them.
 */
function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Which language a stored spelling belongs to. */
type Lang = "en" | "fr";

interface Known {
  key: TranslationKey;
  lang: Lang;
}

/**
 * Builds the lookup, remembering which language each spelling came from.
 *
 * The language is the part that makes this safe. Translating on a bare match
 * would rewrite a French reader's "Fait" into "Terminé" - a different word, in
 * the language they were already reading, for no reason they asked for. A name
 * is only ever swapped when it is in the OTHER language from the reader.
 */
function table(entries: [TranslationKey, Partial<Record<Lang, string[]>>][]): Map<string, Known> {
  const map = new Map<string, Known>();
  for (const [key, byLang] of entries) {
    for (const lang of ["en", "fr"] as Lang[]) {
      for (const alias of byLang[lang] ?? []) map.set(normalise(alias), { key, lang });
    }
  }
  return map;
}

/**
 * The labels in `STATUS_OPTIONS`, in both languages.
 *
 * The French spellings are here because boards imported from a French
 * spreadsheet store "Fait" rather than "Done". Without them the translation
 * only ran one way: a French reader saw English defaults turned into French,
 * while an English reader saw the French ones left as they were - so choosing
 * English got you a board reading half in each.
 */
const STATUS_KEYS = table([
  ["status.workingOnIt", { en: ["Working on it"], fr: ["En cours"] }],
  ["status.done", { en: ["Done"], fr: ["Terminé", "Termine", "Fait"] }],
  ["status.stuck", { en: ["Stuck"], fr: ["Bloqué", "Bloque"] }],
  ["status.notStarted", { en: ["Not Started"], fr: ["Non commencé", "Non commence"] }],
  ["status.overdue", { en: ["Overdue"], fr: ["En retard"] }],
]);

/** The labels in `PRIORITY_OPTIONS`, in both languages. */
const PRIORITY_KEYS = table([
  ["prio.critical", { en: ["Critical"], fr: ["Critique"] }],
  ["prio.high", { en: ["High"], fr: ["Élevée", "Elevee", "Haute"] }],
  ["prio.medium", { en: ["Medium"], fr: ["Moyenne"] }],
  ["prio.low", { en: ["Low"], fr: ["Basse", "Faible"] }],
  ["prio.empty", { en: ["Empty"], fr: ["Aucune", "Vide"] }],
]);

/**
 * Column titles HostFlow creates itself, in both languages.
 *
 * Deliberately narrow. A title is stored text a user is free to rewrite, so
 * every entry here is a name the app or an importer wrote. A column someone
 * named themselves ("Works", "Send to telegram") is their words and is left
 * exactly as they wrote it.
 */
const COLUMN_KEYS = table([
  ["col.status", { en: ["Status"], fr: ["Statut"] }],
  ["col.priority", { en: ["Priority"], fr: ["Priorité", "Priorite"] }],
  ["col.timeline", { en: ["Timeline"], fr: ["Chronologie"] }],
  ["col.owner", { en: ["Owner"], fr: ["Responsable"] }],
  ["col.assignee", { en: ["Assignee"], fr: ["Assigné à", "Assigne a"] }],
  ["col.dependency", { en: ["Dependency"], fr: ["Dépendance", "Dependance"] }],
  ["col.dependsOn", { en: ["Depends on"], fr: ["Dépend de", "Depend de"] }],
  ["col.tag", { en: ["Tag"], fr: ["Étiquette", "Etiquette"] }],
  ["col.tags", { en: ["Tags"], fr: ["Étiquettes", "Etiquettes"] }],
  ["col.notes", { en: ["Notes"] }],
  ["col.comments", { en: ["Comments"], fr: ["Commentaires"] }],
  ["col.collaborator", { en: ["Collaborator"], fr: ["Collaborateur"] }],
  ["col.date", { en: ["Date"] }],
  ["col.dueDate", { en: ["Due Date"], fr: ["Date d'échéance", "Date d'echeance"] }],
  // The item-name column, which boards store as free text like any other.
  ["col.itemName", { en: ["Item Name"], fr: ["Nom de la tâche", "Nom de la tache"] }],
  ["col.item", { en: ["Item"], fr: ["Tâche", "Tache"] }],
  ["col.task", { en: ["Task"] }],
  ["col.name", { en: ["Name"], fr: ["Nom"] }],
  // The defaultTitle of every type in the "+ Add column" menu.
  ["col.text", { en: ["Text"], fr: ["Texte"] }],
  ["col.numbers", { en: ["Numbers"], fr: ["Nombres"] }],
  ["col.files", { en: ["Files"], fr: ["Fichiers"] }],
  ["col.formula", { en: ["Formula"], fr: ["Formule"] }],
  ["col.done", { en: ["Done?"] }],
  ["col.link", { en: ["Link"], fr: ["Lien"] }],
  ["col.rating", { en: ["Rating"], fr: ["Note"] }],
  ["col.relation", { en: ["Relation"] }],
  ["col.button", { en: ["Button"], fr: ["Bouton"] }],
]);

function lookUp(
  keys: Map<string, Known>,
  t: Translate,
  value: string | null | undefined,
): string {
  if (typeof value !== "string") return "";
  const known = keys.get(normalise(value));
  if (!known) return value;

  const rendered = t(known.key);

  // Which language the reader is in, read off the answer rather than passed in:
  // t() hands back the canonical name for their locale, and that spelling is
  // itself in the table. When it agrees with the language the stored name was
  // written in, the name already reads correctly and the user's own wording is
  // kept - "Fait" stays "Fait" for a French reader rather than becoming
  // "Terminé". Only a name in the other language is swapped.
  const renderedLang = keys.get(normalise(rendered))?.lang;
  return renderedLang && renderedLang === known.lang ? value : rendered;
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
