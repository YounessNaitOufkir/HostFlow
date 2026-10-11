import { describe, it, expect, vi, beforeEach } from "vitest";
import { addDaysOnly, parseDateOnly, toDateOnly } from "@/lib/gantt/dates";
import { todayInTimezone } from "@/lib/orgTime";

/** PostgREST's silent cap: a read without paging gets this many rows at most. */
const MAX_ROWS = 1000;

const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }));
const sendEmail = vi.hoisted(() => vi.fn(async () => ({ success: true })));

/** Just enough of the query builder for this route; filters are pre-applied in the data. */
function query(rows: unknown[]) {
  let from = 0;
  let to = Infinity;
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    range: (f: number, t: number) => {
      from = f;
      to = t;
      return builder;
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null }),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: (table: string) => query(db.tables[table] ?? []) }),
}));
vi.mock("@/lib/cronHeartbeat", () => ({ startCronRun: async () => "run", finishCronRun: async () => {} }));
vi.mock("@/app/actions/telegram-notifications", () => ({ notifyUsersViaTelegram: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail }));

import { GET } from "@/app/api/cron/daily-digest/route";

const TODAY = parseDateOnly(todayInTimezone(null))!;
const day = (offset: number) => toDateOnly(addDaysOnly(TODAY, offset));

const board = {
  id: "b1",
  name: "Rénovation",
  workspace_id: "w1",
  gantt_config: null,
  columns: [
    { id: "tl", title: "Timeline", type: "timeline" },
    { id: "p", title: "Owner", type: "people" },
    { id: "st", title: "Status", type: "status" },
  ],
};
const profile = (id: string) => ({
  id,
  email: `${id}@example.test`,
  full_name: id,
  daily_digest_enabled: true,
  digest_channel: "email",
  language: "en",
});
const item = (id: string, end: number, people: string[]) => ({
  id,
  name: id,
  board_id: "b1",
  group_id: "g",
  position: 0,
  column_values: { tl: { start: day(end), end: day(end) }, p: people },
});

const run = () =>
  GET(new Request("http://localhost/api/cron/daily-digest", { headers: { authorization: "Bearer secret" } }));
const mailTo = (id: string) =>
  (sendEmail.mock.calls as unknown as [{ to: string; text: string }][]).find(([m]) => m.to === `${id}@example.test`)?.[0];

beforeEach(() => {
  process.env.CRON_SECRET = "secret";
  sendEmail.mockClear();
  db.tables = {
    profiles: [profile("u1"), profile("u2")],
    boards: [board],
    organization_settings: [],
    workspaces: [{ id: "w1", name: "Agdal T3" }],
    items: [],
    item_links: [],
  };
});

describe("daily digest cron", () => {
  it("reads past PostgREST's 1000-row cap", () => {
    // Far-future filler first, so the reader's own task sits on the second page.
    const filler = Array.from({ length: 1500 }, (_, i) => item(`Filler ${i}`, 60, ["someone-else"]));
    filler.splice(1400, 0, item("Ménage page deux", 0, ["u1"]));
    db.tables.items = filler;
    return run().then(() => {
      const mail = mailTo("u1");
      expect(mail?.text).toContain("Ménage page deux");
    });
  });

  it("leads with Now, and writes to a reader whose only task is due soon", async () => {
    db.tables.items = [item("Valider le devis", 2, ["u2"]), item("Plus tard", 1, ["u2"])];
    await run();
    const mail = mailTo("u2");
    expect(mail?.text).toContain("Now (2)");
    expect(mail?.text).not.toContain("Due Today");
    expect(mailTo("u1")).toBeUndefined();
  });

  it("ranks with the dependency links", async () => {
    // Same due date: the one with work waiting behind it comes first.
    db.tables.items = [
      item("Alone", 3, ["u1"]),
      item("Blocker", 3, ["u1"]),
      item("Next 1", 20, ["x"]),
      item("Next 2", 21, ["x"]),
    ];
    db.tables.item_links = [
      { id: "l1", source_item_id: "Blocker", target_item_id: "Next 1", link_type: "dependency" },
      { id: "l2", source_item_id: "Next 1", target_item_id: "Next 2", link_type: "dependency" },
    ];
    await run();
    const text = mailTo("u1")!.text;
    expect(text.indexOf("Blocker")).toBeLessThan(text.indexOf("Alone"));
  });
});
