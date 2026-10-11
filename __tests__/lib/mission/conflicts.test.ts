import { describe, it, expect } from "vitest";
import type { Board, Item } from "@/types";
import { addDaysOnly, dayIndex, parseDateOnly, toDateOnly } from "@/lib/gantt/dates";
import { findOnSiteConflicts } from "@/lib/mission/conflicts";

const TODAY_DATE = parseDateOnly("2026-10-08")!;
const TODAY = dayIndex(TODAY_DATE);
const day = (offset: number) => toDateOnly(addDaysOnly(TODAY_DATE, offset));

const COLS: Board["columns"] = [
  { id: "tl", title: "Timeline", type: "timeline" },
  { id: "p", title: "Owner", type: "people" },
  { id: "st", title: "Status", type: "status" },
  { id: "s", title: "On site", type: "on_site" },
];
const sale: Board = { id: "b-sale", name: "Salé", description: "", workspace_id: "ws-sale", columns: COLS };
const sale2: Board = { id: "b-sale2", name: "Salé travaux", description: "", workspace_id: "ws-sale", columns: COLS };
const souissi: Board = { id: "b-souissi", name: "Souissi", description: "", workspace_id: "ws-souissi", columns: COLS };
const agdal: Board = { id: "b-agdal", name: "Agdal", description: "", workspace_id: "ws-agdal", columns: COLS };
const boardsById = new Map([sale, sale2, souissi, agdal].map((b) => [b.id, b]));

const visit = (id: string, board: Board, offset: number, people: string[], extra: Record<string, unknown> = {}): Item => ({
  id,
  name: id,
  board_id: board.id,
  group_id: "g",
  position: 0,
  column_values: { tl: { start: day(offset), end: day(offset) }, p: people, s: true, ...extra },
});
const ids = (cs: ReturnType<typeof findOnSiteConflicts>) => cs.map((c) => c.tasks.map((t) => t.item.id).sort().join("+"));

describe("findOnSiteConflicts", () => {
  it("flags the same person at two properties on the same day", () => {
    const cs = findOnSiteConflicts([visit("EDL", sale, 4, ["you"]), visit("Livraison", souissi, 4, ["you"])], boardsById, TODAY);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ personId: "you", dayIdx: TODAY + 4 });
  });

  it("ignores two visits at the same property", () =>
    expect(findOnSiteConflicts([visit("A", sale, 4, ["you"]), visit("B", sale2, 4, ["you"])], boardsById, TODAY)).toEqual([]));

  it("ignores different people", () =>
    expect(findOnSiteConflicts([visit("A", sale, 4, ["you"]), visit("B", souissi, 4, ["amine"])], boardsById, TODAY)).toEqual([]));

  it("ignores days outside the window", () =>
    expect(findOnSiteConflicts([visit("A", sale, 9, ["you"]), visit("B", souissi, 9, ["you"])], boardsById, TODAY)).toEqual([]));

  it("ignores tasks that are not marked on site", () =>
    expect(findOnSiteConflicts([visit("A", sale, 4, ["you"]), visit("B", souissi, 4, ["you"], { s: false })], boardsById, TODAY)).toEqual([]));

  it("reports three overlapping visits as three pairs, none twice, even with two shared people", () => {
    const cs = findOnSiteConflicts(
      [visit("A", sale, 2, ["you", "amine"]), visit("B", souissi, 2, ["you", "amine"]), visit("C", agdal, 2, ["you"])],
      boardsById,
      TODAY
    );
    expect(ids(cs).sort()).toEqual(["A+B", "A+C", "B+C"]);
  });

  it("never lets a done task conflict", () =>
    expect(findOnSiteConflicts([visit("A", sale, 4, ["you"]), visit("B", souissi, 4, ["you"], { st: "Done" })], boardsById, TODAY)).toEqual([]));

  it("reports a multi-day overlap on its first shared day", () => {
    const long: Item = { ...visit("Long", sale, 1, ["you"]), column_values: { tl: { start: day(1), end: day(5) }, p: ["you"], s: true } };
    const cs = findOnSiteConflicts([long, visit("Short", souissi, 3, ["you"])], boardsById, TODAY);
    expect(cs.map((c) => c.dayIdx)).toEqual([TODAY + 3]);
  });
});
