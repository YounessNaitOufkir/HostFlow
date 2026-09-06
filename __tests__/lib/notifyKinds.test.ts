import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KINDS } from "@/app/api/telegram/notify/route";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";

/**
 * The route writes the alert; the client only names a kind. That is what makes
 * a per-recipient language possible and stops a signed-in user posting HTML to
 * someone else's phone — but it also means a caller and the route can drift
 * apart silently, and they did.
 *
 * When the route moved to this contract, the two mention callers in ItemPanel
 * came with it and the assignment caller in useItemMutations did not. It kept
 * posting the old { userIds, message } shape, the route answered 400, and
 * assignment alerts stopped arriving. Nothing surfaced it: a 400 RESOLVES the
 * fetch, so the caller's .catch() never ran, and the route logs nothing for a
 * rejected request. The only symptom was silence.
 */

const CALL_SITES = [
  "hooks/store/useItemMutations.ts",
  "components/ItemPanel.tsx",
];

describe("telegram notification kinds", () => {
  it("offers a kind for every alert the product sends", () => {
    expect(Object.keys(KINDS).sort()).toEqual(
      ["assignment", "mention.reply", "mention.update"].sort()
    );
  });

  it("every kind's text exists in BOTH catalogues", () => {
    // translate() falls back to English for a missing key, so a French reader
    // would get an English alert rather than an error. Checked here instead.
    for (const [kind, template] of Object.entries(KINDS)) {
      for (const key of [template.title, template.body]) {
        expect(en[key], `en is missing ${key} (${kind})`).toBeTruthy();
        expect(fr[key], `fr is missing ${key} (${kind})`).toBeTruthy();
      }
    }
  });

  it("no caller still posts the retired `message` contract", () => {
    // The actual regression, caught at its source: a call site that hands the
    // route a sentence instead of a kind is one the route will refuse.
    for (const relative of CALL_SITES) {
      const source = readFileSync(join(process.cwd(), relative), "utf8");
      const posts = source.split("/api/telegram/notify").slice(1);
      for (const after of posts) {
        const body = after.slice(0, 500);
        expect(body, `${relative} posts a caller-written message`).not.toMatch(
          /\bmessage:/
        );
        expect(body, `${relative} posts no kind`).toMatch(/\bkind:/);
      }
    }
  });

  it("every kind a caller names is one the route accepts", () => {
    for (const relative of CALL_SITES) {
      const source = readFileSync(join(process.cwd(), relative), "utf8");
      for (const after of source.split("/api/telegram/notify").slice(1)) {
        const named = after.slice(0, 500).match(/\bkind:\s*["'`]([^"'`]+)["'`]/);
        expect(named, `${relative} names no kind`).not.toBeNull();
        expect(
          Object.keys(KINDS),
          `${relative} posts kind "${named![1]}", which the route would refuse`
        ).toContain(named![1]);
      }
    }
  });
});
