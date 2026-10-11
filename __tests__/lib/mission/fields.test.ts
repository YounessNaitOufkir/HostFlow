import { describe, it, expect } from "vitest";
import type { Board, Column, Item } from "@/types";
import { isOnSite, parseWaitingOn, waitingOnOf } from "@/lib/mission/fields";

describe("parseWaitingOn", () => {
  it("accepts a full value", () =>
    expect(parseWaitingOn({ who: "Menuisier", since: "2026-10-03", followUp: "2026-10-08" })).toEqual({
      who: "Menuisier",
      since: "2026-10-03",
      followUp: "2026-10-08",
    }));

  it("accepts a JSON string", () =>
    expect(parseWaitingOn('{"who":"Banque","since":"2026-10-06","followUp":null}')?.who).toBe("Banque"));

  it("trims who and rejects an empty one", () => {
    expect(parseWaitingOn({ who: "  Amine ", since: "2026-10-05", followUp: null })?.who).toBe("Amine");
    expect(parseWaitingOn({ who: "  ", since: "2026-10-05", followUp: null })).toBeNull();
  });

  it("rejects a missing or invalid since, and drops an invalid followUp", () => {
    expect(parseWaitingOn({ who: "X", followUp: null })).toBeNull();
    expect(parseWaitingOn({ who: "X", since: "nope", followUp: null })).toBeNull();
    expect(parseWaitingOn({ who: "X", since: "2026-10-05", followUp: "nope" })?.followUp).toBeNull();
  });

  it("treats a missing followUp as none", () =>
    expect(parseWaitingOn({ who: "X", since: "2026-10-05" })).toEqual({ who: "X", since: "2026-10-05", followUp: null }));

  it("rejects a non-string who", () => expect(parseWaitingOn({ who: 7, since: "2026-10-05" })).toBeNull());

  it.each([null, undefined, "", 42, [], "{bad json", true])("returns null for %p", (v) =>
    expect(parseWaitingOn(v)).toBeNull());
});

const board = (columns: Column[]): Board => ({ id: "b", name: "B", description: "", columns });
const item = (column_values: Record<string, unknown>): Item =>
  ({ id: "t", group_id: "g", name: "T", position: 0, board_id: "b", column_values }) as Item;

describe("isOnSite / waitingOnOf", () => {
  const b = board([
    { id: "w", title: "Waiting on", type: "waiting_on" },
    { id: "s", title: "On site", type: "on_site" },
  ]);

  it("reads the typed columns", () => {
    const it1 = item({ w: { who: "Banque", since: "2026-10-06", followUp: null }, s: true });
    expect(isOnSite(it1, b)).toBe(true);
    expect(waitingOnOf(it1, b)?.who).toBe("Banque");
    expect(isOnSite(item({ s: false }), b)).toBe(false);
    expect(waitingOnOf(item({}), b)).toBeNull();
  });

  it("skips a malformed waiting_on column and uses the next valid one", () => {
    const b2 = board([
      { id: "w1", title: "W1", type: "waiting_on" },
      { id: "w2", title: "W2", type: "waiting_on" },
    ]);
    expect(waitingOnOf(item({ w1: "{bad", w2: { who: "Amine", since: "2026-10-05" } }), b2)?.who).toBe("Amine");
  });

  it("ignores a checkbox column named 'Sur place'", () => {
    const b3 = board([{ id: "c", title: "Sur place", type: "checkbox" }]);
    expect(isOnSite(item({ c: true }), b3)).toBe(false);
  });

  it("only counts a real true, not a truthy string", () => expect(isOnSite(item({ s: "yes" }), b)).toBe(false));
});
