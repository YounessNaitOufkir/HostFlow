import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Profile } from "@/types";

// Captured rather than sent. Declared through vi.hoisted because vi.mock is
// lifted above the imports and cannot close over an ordinary const.
const { sent } = vi.hoisted(() => ({ sent: [] as any[] }));

vi.mock("@/lib/email", () => ({
  sendEmail: async (options: any) => {
    sent.push(options);
    return { success: true, id: "captured" };
  },
}));

import { evaluateTimeAutomations } from "@/lib/automations/engine";

const board: any = {
  id: "board-1",
  name: "Studio A",
  description: "",
  columns: [
    { id: "col-status", title: "Status", type: "status" },
    { id: "col-date", title: "Due Date", type: "date" },
    { id: "col-person", title: "Owner", type: "people" },
  ],
  automations: [
    {
      id: "auto-overdue",
      board_id: "board-1",
      trigger_column_id: "col-date",
      trigger_value: "due_date_passed",
      action_type: "overdue_tagging",
      enabled: true,
    },
  ],
  items: [
    {
      id: "item-1",
      board_id: "board-1",
      group_id: "group-1",
      name: "Permis de construire",
      position: 0,
      column_values: {
        "col-date": "2020-03-01",
        "col-status": "Working on it",
        "col-person": "user-1",
      },
    },
  ],
};

const supabase: any = {
  from: () => ({
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
    insert: async () => ({ data: null, error: null }),
  }),
};

function profileWith(language?: string): Profile[] {
  return [
    {
      id: "user-1",
      email: "amina@example.test",
      full_name: "Amina",
      avatar_initials: "A",
      color: "blue",
      ...(language ? { language } : {}),
    } as Profile,
  ];
}

beforeEach(() => {
  sent.length = 0;
});

describe("automation emails follow the recipient's language", () => {
  it("writes to an English reader in English", async () => {
    await evaluateTimeAutomations(board, profileWith("en"), supabase);

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("is overdue");
    expect(sent[0].html).toContain("A task is overdue");
    expect(sent[0].text).toContain("Hi Amina,");
    expect(sent[0].text).toContain("1 March 2020");
  });

  it("writes to a French reader in French, dates included", async () => {
    // The whole point: the language lives in localStorage, which this code path
    // cannot reach, so it has to come off the profile.
    await evaluateTimeAutomations(board, profileWith("fr"), supabase);

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("est en retard");
    expect(sent[0].html).toContain("Une t\u00e2che est en retard");
    expect(sent[0].text).toContain("Bonjour Amina,");
    // A date left in English is the thing that gives a translation away.
    expect(sent[0].text).toContain("1 mars 2020");
    expect(sent[0].text).not.toContain("March");
  });

  it("falls back to English when no language has ever been chosen", async () => {
    await evaluateTimeAutomations(board, profileWith(undefined), supabase);

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("is overdue");
  });

  it("ignores a language the app does not have a dictionary for", async () => {
    await evaluateTimeAutomations(board, profileWith("de"), supabase);

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("is overdue");
  });
});
