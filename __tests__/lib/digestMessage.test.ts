import { describe, it, expect } from "vitest";
import {
  buildDigestMessage,
  MAX_ITEMS_PER_SECTION,
  MAX_NAME_CHARS,
  DIGEST_CHAR_BUDGET,
} from "@/lib/digestMessage";
import { TELEGRAM_MAX_MESSAGE_CHARS } from "@/lib/telegram";

const tasks = (n: number, prefix = "Task") =>
  Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${i + 1}` }));

describe("buildDigestMessage", () => {
  it("stays within Telegram's limit for a realistic backlog", () => {
    // The case that broke it in production: 200 overdue and 1 due today came to
    // roughly 6,300 characters and Telegram rejected the whole message.
    const message = buildDigestMessage(tasks(1, "Due"), tasks(200, "Late"));

    expect(message.length).toBeLessThanOrEqual(DIGEST_CHAR_BUDGET);
    expect(message.length).toBeLessThan(TELEGRAM_MAX_MESSAGE_CHARS);
  });

  it("survives a pathological backlog without exceeding the budget", () => {
    const huge = Array.from({ length: 5000 }, (_, i) => ({
      name: `An extremely long task name that goes on and on and on, number ${i}`,
    }));
    const message = buildDigestMessage(huge, huge);
    expect(message.length).toBeLessThanOrEqual(DIGEST_CHAR_BUDGET);
  });

  it("reports the true totals even though it lists only the first few", () => {
    const message = buildDigestMessage([], tasks(200, "Late"));

    // The count is of everything, not of what is shown.
    expect(message).toContain("Overdue (200)");
    expect(message).toContain("You have 200 tasks needing attention");
    expect(message).toContain(`…and ${200 - MAX_ITEMS_PER_SECTION} more`);
    expect(message).toContain("Late 1");
    expect(message).not.toContain("Late 200");
  });

  it("lists everything when a section is short enough", () => {
    const message = buildDigestMessage(tasks(3, "Due"), []);
    expect(message).toContain("Due 1");
    expect(message).toContain("Due 3");
    expect(message).not.toContain("and 0 more");
  });

  it("escapes task names so a stray angle bracket cannot break the send", () => {
    // parse_mode is HTML; an unescaped "<" makes Telegram reject the message.
    const message = buildDigestMessage([{ name: 'Q1 <review> & "sign-off"' }], []);

    expect(message).toContain("Q1 &lt;review&gt; &amp; ");
    expect(message).not.toContain("<review>");
  });

  it("names the property, so identical task names stay tellable apart", () => {
    // Every apartment runs the same lifecycle, so the same task name exists on
    // many properties. Without the workspace these lines are indistinguishable.
    const message = buildDigestMessage(
      [],
      [
        { name: "Commander les rideaux", workspace: "App C" },
        { name: "Commander les rideaux", workspace: "Studio A" },
      ]
    );

    expect(message).toContain("Commander les rideaux — <i>App C</i>");
    expect(message).toContain("Commander les rideaux — <i>Studio A</i>");
  });

  it("still lists a task whose property is unknown", () => {
    const message = buildDigestMessage([{ name: "Orphan task" }], []);
    expect(message).toContain("Orphan task");
    expect(message).not.toContain("—");
  });

  it("escapes the property name too", () => {
    const message = buildDigestMessage([{ name: "Task", workspace: "A & B <x>" }], []);
    expect(message).toContain("A &amp; B &lt;x&gt;");
  });

  it("uses HTML tags rather than Markdown, matching the parse mode", () => {
    const message = buildDigestMessage(tasks(1, "Due"), []);
    expect(message).toContain("<b>Your Daily HostFlow Digest</b>");
    expect(message).not.toContain("*Your Daily HostFlow Digest*");
  });

  it("truncates a single absurdly long name", () => {
    const message = buildDigestMessage([{ name: "x".repeat(500) }], []);
    expect(message).not.toContain("x".repeat(MAX_NAME_CHARS + 1));
    expect(message).toContain("…");
  });

  it("uses the singular for a single task", () => {
    expect(buildDigestMessage([{ name: "Only one" }], [])).toContain("You have 1 task needing");
  });

  it("omits a section that has nothing in it", () => {
    const message = buildDigestMessage([], tasks(2, "Late"));
    expect(message).not.toContain("Due Today");
    expect(message).toContain("Overdue (2)");
  });
  it("is written in the reader's language, not the sender's", () => {
    const message = buildDigestMessage(
      [{ name: "Nettoyage", workspace: "Résidence Alpha" }],
      tasks(2, "Retard"),
      "fr",
    );
    expect(message).toContain("Votre récapitulatif HostFlow du jour");
    expect(message).toContain("Vous avez 3 tâches");
    expect(message).toContain("À rendre aujourd'hui (1)");
    expect(message).toContain("En retard (2)");
    // Task and property names are the user's data, not ours to translate.
    expect(message).toContain("Nettoyage");
    expect(message).toContain("Résidence Alpha");
  });

  it("uses the French singular too", () => {
    expect(buildDigestMessage([{ name: "Une seule" }], [], "fr")).toContain(
      "Vous avez 1 tâche",
    );
  });

  it("still caps a French digest, whose words are longer", () => {
    const message = buildDigestMessage(tasks(200), tasks(200), "fr");
    expect(message.length).toBeLessThanOrEqual(DIGEST_CHAR_BUDGET);
    expect(message.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_CHARS);
  });
});
