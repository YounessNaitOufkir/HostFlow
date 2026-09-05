import { describe, it, expect } from "vitest";
import {
  displayStatus,
  displayPriority,
  displayColumnTitle,
  displayCellLabel,
} from "@/lib/i18n/labels";
import { translate } from "@/lib/i18n";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/types";
import type { TranslationKey } from "@/lib/i18n/types";

const fr = (key: TranslationKey) => translate("fr", key);
const en = (key: TranslationKey) => translate("en", key);

describe("display labels", () => {
  it("renders each shipped status in French", () => {
    expect(displayStatus(fr, "Done")).toBe("Terminé");
    expect(displayStatus(fr, "Working on it")).toBe("En cours");
    expect(displayStatus(fr, "Stuck")).toBe("Bloqué");
    expect(displayStatus(fr, "Not Started")).toBe("Non commencé");
    expect(displayStatus(fr, "Overdue")).toBe("En retard");
  });

  it("leaves the English rendering alone", () => {
    for (const opt of STATUS_OPTIONS) {
      expect(displayStatus(en, opt.label)).toBe(opt.label);
    }
    for (const opt of PRIORITY_OPTIONS) {
      expect(displayPriority(en, opt.label)).toBe(opt.label);
    }
  });

  it("covers every option the app ships, so none is left in English", () => {
    for (const opt of STATUS_OPTIONS) {
      expect(displayStatus(fr, opt.label)).not.toBe(opt.label);
    }
    for (const opt of PRIORITY_OPTIONS) {
      expect(displayPriority(fr, opt.label)).not.toBe(opt.label);
    }
  });

  it("keeps a board's own wording for a reader who can already read it", () => {
    // A real board here lists exactly these. To a French reader they are the
    // user's own words and are left alone - rewriting "Fait" as "Terminé"
    // would be changing their vocabulary for no reason they asked for.
    //
    // This used to assert the same of an English reader, which was wrong: it
    // left an imported board reading half in French for someone who had
    // chosen English. A name in the OTHER language is now translated.
    for (const own of ["Fait", "En cours", "Bloqué", "En retard"]) {
      expect(displayStatus(fr, own)).toBe(own);
    }
    expect(displayStatus(en, "Fait")).toBe("Done");
    expect(displayStatus(en, "En cours")).toBe("Working on it");
    for (const own of ["Critique", "Élevée", "Moyenne", "Basse"]) {
      expect(displayPriority(fr, own)).toBe(own);
    }
    expect(displayStatus(fr, "Awaiting client sign-off")).toBe("Awaiting client sign-off");
  });

  it("translates the column titles the app creates, and no others", () => {
    expect(displayColumnTitle(fr, "Status")).toBe("Statut");
    expect(displayColumnTitle(fr, "Timeline")).toBe("Chronologie");
    expect(displayColumnTitle(fr, "Depends on")).toBe("Dépend de");
    // Named by a user on a real board - not ours to translate.
    expect(displayColumnTitle(fr, "Works")).toBe("Works");
    expect(displayColumnTitle(fr, "Send to telegram")).toBe("Send to telegram");
    // Already French, and not one of ours.
    expect(displayColumnTitle(fr, "Collaborateur")).toBe("Collaborateur");
  });

  it("picks the table matching the column type", () => {
    // "Empty" is a priority label; a status column must not borrow it.
    expect(displayCellLabel(fr, "priority", "Empty")).toBe("Aucune");
    expect(displayCellLabel(fr, "status", "Empty")).toBe("Empty");
    expect(displayCellLabel(fr, "text", "Done")).toBe("Done");
  });

  it("survives a missing value", () => {
    expect(displayStatus(fr, null)).toBe("");
    expect(displayStatus(fr, undefined)).toBe("");
    expect(displayColumnTitle(fr, "")).toBe("");
  });

  it("ignores surrounding whitespace, which the importer leaves behind", () => {
    expect(displayStatus(fr, " Done ")).toBe("Terminé");
  });
});

describe("a name stored in either language reads in the reader's", () => {
  // The bug this covers: the tables only mapped English defaults, so French
  // mode turned "Status" into "Statut" while English mode left an imported
  // "Statut" alone - a board reading half in each language.
  it("renders French-stored column titles in English", () => {
    expect(displayColumnTitle(en, "Statut")).toBe("Status");
    expect(displayColumnTitle(en, "Priorité")).toBe("Priority");
    expect(displayColumnTitle(en, "Dépend de")).toBe("Depends on");
    expect(displayColumnTitle(en, "Responsable")).toBe("Owner");
    expect(displayColumnTitle(en, "Commentaires")).toBe("Comments");
  });

  it("renders French-stored statuses and priorities in English", () => {
    expect(displayStatus(en, "Fait")).toBe("Done");
    expect(displayStatus(en, "En cours")).toBe("Working on it");
    expect(displayStatus(en, "Bloqué")).toBe("Stuck");
    expect(displayStatus(en, "En retard")).toBe("Overdue");
    expect(displayPriority(en, "Critique")).toBe("Critical");
    expect(displayPriority(en, "Élevée")).toBe("High");
    expect(displayPriority(en, "Basse")).toBe("Low");
  });

  it("still renders English-stored names in French", () => {
    expect(displayColumnTitle(fr, "Status")).toBe("Statut");
    expect(displayStatus(fr, "Done")).toBe("Terminé");
  });

  it("matches whether or not the accents survived the import", () => {
    expect(displayColumnTitle(en, "Priorite")).toBe("Priority");
    expect(displayStatus(en, "Bloque")).toBe("Stuck");
    expect(displayPriority(en, "Elevee")).toBe("High");
  });

  it("leaves a name the user chose alone, in either language", () => {
    for (const t of [en, fr]) {
      expect(displayColumnTitle(t, "Works")).toBe("Works");
      expect(displayColumnTitle(t, "Send to telegram")).toBe("Send to telegram");
      expect(displayStatus(t, "Awaiting client sign-off")).toBe("Awaiting client sign-off");
    }
  });
});
