import { describe, it, expect } from "vitest";
import { notificationText } from "@/lib/notificationText";
import { translate } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

const fr = (k: TranslationKey, v?: Record<string, string | number>) => translate("fr", k, v);
const en = (k: TranslationKey, v?: Record<string, string | number>) => translate("en", k, v);

describe("notificationText", () => {
  const mention = {
    message: "Amine mentioned you in an update on \"Kickoff call\"",
    message_key: "notif.mentionUpdate" as TranslationKey,
    message_vars: { actor: "Amine", item: "Kickoff call" },
  };

  it("renders in the reader's language, not the writer's", () => {
    expect(en(mention.message_key, mention.message_vars)).toContain("mentioned you");
    const french = notificationText(fr, mention);
    expect(french).toContain("vous a mentionné");
    expect(french).toContain("Amine");
    expect(french).toContain("Kickoff call");
  });

  it("leaves names and task titles exactly as they were typed", () => {
    const odd = { ...mention, message_vars: { actor: "Ait Wakrim", item: "Devis <2024> & suite" } };
    expect(notificationText(fr, odd)).toContain("Devis <2024> & suite");
  });

  it("falls back to the stored sentence on a row written before keys existed", () => {
    expect(
      notificationText(fr, { message: "Older notification", message_key: null, message_vars: null })
    ).toBe("Older notification");
  });

  it("falls back when this build does not know the key", () => {
    expect(
      notificationText(fr, {
        message: "Something happened",
        message_key: "notif.doesNotExist" as TranslationKey,
        message_vars: {},
      })
    ).toBe("Something happened");
  });

  it("survives a row with neither key nor message", () => {
    expect(notificationText(fr, { message: "", message_key: null, message_vars: null })).toBe("");
  });
});
