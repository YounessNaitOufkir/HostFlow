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

  it("passes a board's own labels straight through", () => {
    // A real board here lists exactly these. They are the user's words, and
    // translating them would be rewriting their data.
    for (const own of ["Fait", "En cours", "Bloqué", "En retard"]) {
      expect(displayStatus(fr, own)).toBe(own);
      expect(displayStatus(en, own)).toBe(own);
    }
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
