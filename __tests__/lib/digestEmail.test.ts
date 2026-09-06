import { describe, it, expect } from "vitest";
import { buildDigestEmail } from "@/lib/digestEmail";
import { buildDigestMessage, MAX_ITEMS_PER_SECTION } from "@/lib/digestMessage";

const task = (name: string, workspace?: string) => ({ name, workspace });

describe("buildDigestEmail", () => {
  it("lists both sections, with counts", () => {
    const mail = buildDigestEmail(
      [task("Livraison matelas", "Villa Souissi")],
      [task("Peinture salon", "Résidence Anfa"), task("Plomberie")],
      "en"
    );
    expect(mail.html).toContain("Due Today (1)");
    expect(mail.html).toContain("Overdue (2)");
    expect(mail.html).toContain("Livraison matelas");
    expect(mail.text).toContain("- Plomberie");
  });

  it("keeps the property on the line, because names repeat across them", () => {
    // Every apartment runs the same lifecycle, so "Peinture salon" alone
    // identifies nothing.
    const mail = buildDigestEmail([], [task("Peinture salon", "Résidence Anfa")], "en");
    expect(mail.html).toContain("Peinture salon — Résidence Anfa");
  });

  it("escapes task names rather than trusting them", () => {
    const mail = buildDigestEmail([], [task("<script>alert(1)</script>")], "en");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("caps a long section exactly as Telegram does", () => {
    const many = Array.from({ length: MAX_ITEMS_PER_SECTION + 5 }, (_, i) =>
      task(`Task ${i}`)
    );
    const mail = buildDigestEmail([], many, "en");
    expect(mail.html).toContain(`Overdue (${many.length})`);
    expect(mail.html).toContain("and 5 more");
    expect(mail.html).not.toContain(`Task ${MAX_ITEMS_PER_SECTION + 1}`);
  });

  it("counts the same tasks the Telegram digest counts", () => {
    // The two channels must not disagree about what is due: someone with both
    // should see one digest twice, not two digests.
    const due = [task("A"), task("B")];
    const late = [task("C")];
    const telegram = buildDigestMessage(due, late, "en");
    const mail = buildDigestEmail(due, late, "en");
    expect(telegram).toContain("Due Today (2)");
    expect(mail.html).toContain("Due Today (2)");
    expect(telegram).toContain("Overdue (1)");
    expect(mail.html).toContain("Overdue (1)");
  });

  it("says how many tasks in the subject, singular and plural", () => {
    expect(buildDigestEmail([task("A")], [], "en").subject).toContain("1 task needs");
    expect(buildDigestEmail([task("A")], [task("B")], "en").subject).toContain("2 tasks need");
  });

  it("is written in the reader's language", () => {
    const fr = buildDigestEmail([task("A")], [], "fr");
    expect(fr.subject).toContain("tâche");
    // The apostrophe arrives escaped, so match the part before it.
    expect(fr.html).toContain("À rendre aujourd");
    // translate() falls back to English, so this is what proves fr.ts has them.
    expect(fr.html).not.toContain("Due Today");
    expect(fr.html).not.toContain("Open HostFlow");
  });

  it("greets by name only when there is one", () => {
    expect(buildDigestEmail([task("A")], [], "en", "Salma").html).toContain("Hi Salma,");
    expect(buildDigestEmail([task("A")], [], "en", null).html).not.toContain("Hi ,");
  });
});
