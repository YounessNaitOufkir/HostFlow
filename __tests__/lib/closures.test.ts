import { describe, it, expect } from "vitest";
import type { Board, Column, Item, Place, PublicHoliday } from "@/types";
import {
  checkRange,
  closedDayWarning,
  closedReasonsOn,
  holidayOn,
  normalizeTag,
  placesForTags,
  tagsOf,
  type Closures,
} from "@/lib/closures";

// 19 Oct 2026 is a Monday.
const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
};

const bank: Place = { id: "p1", name: "Banque", tags: ["banque", "bank"], closed_weekdays: [0, 6], closed_on_holidays: true };
const souk: Place = { id: "p2", name: "Souk Salihine", tags: ["souk salihine"], closed_weekdays: [5], closed_on_holidays: false };

const greenMarch: PublicHoliday = { id: "h1", name: "Marche Verte", month: 11, day: 6, year: null, estimated: false };
const independence: PublicHoliday = { id: "h2", name: "Fête de l'Indépendance", month: 11, day: 18, year: null, estimated: false };
const eid2027: PublicHoliday = { id: "h3", name: "Aïd Al Fitr", month: 3, day: 10, year: 2027, estimated: true };

const closures: Closures = { places: [bank, souk], holidays: [greenMarch, independence, eid2027] };

const TL: Column = { id: "tl", title: "Timeline", type: "timeline" };
const TAGS: Column = { id: "tags", title: "Tags", type: "tags" };
const STATUS: Column = { id: "st", title: "Status", type: "status" };
const board: Pick<Board, "columns"> = { columns: [STATUS, TAGS, TL] };

function task(values: Record<string, unknown>): Item {
  return { id: "i1", name: "Virement loyer", group_id: "g", board_id: "b", position: 0, column_values: values } as Item;
}

describe("normalizeTag", () => {
  it("ignores case, accents, a leading # and extra spaces", () => {
    expect(normalizeTag("#Banqué ")).toBe("banque");
    expect(normalizeTag("Souk   Salihine")).toBe("souk salihine");
  });
});

describe("placesForTags", () => {
  it("finds a place by any of its tags, in any spelling", () => {
    expect(placesForTags(["BANK"], [bank, souk])).toEqual([bank]);
    expect(placesForTags(["#souk salihine", "banque"], [bank, souk])).toEqual([bank, souk]);
  });

  it("finds nothing for unrelated tags", () => {
    expect(placesForTags(["plomberie"], [bank, souk])).toEqual([]);
  });
});

describe("tagsOf", () => {
  it("reads every tags column and skips the rest", () => {
    const columns: Column[] = [TAGS, { id: "t2", title: "More", type: "tags" }, TL];
    expect(tagsOf(task({ tags: ["a"], t2: ["b"], tl: { start: "x" } }), columns)).toEqual(["a", "b"]);
  });
});

describe("holidayOn", () => {
  it("matches a yearly holiday in any year and a dated one only in its year", () => {
    expect(holidayOn(d("2026-11-06"), closures.holidays)).toBe(greenMarch);
    expect(holidayOn(d("2031-11-06"), closures.holidays)).toBe(greenMarch);
    expect(holidayOn(d("2027-03-10"), closures.holidays)).toBe(eid2027);
    expect(holidayOn(d("2028-03-10"), closures.holidays)).toBeNull();
  });
});

describe("closedReasonsOn", () => {
  it("names the weekday a place is shut", () => {
    expect(closedReasonsOn(d("2026-10-24"), [bank], [])).toEqual([{ place: bank, kind: "weekday", weekday: 6 }]);
  });

  it("names the holiday, only for places that close on holidays", () => {
    // 18 Nov 2026 is a Wednesday.
    expect(closedReasonsOn(d("2026-11-18"), [bank, souk], closures.holidays)).toEqual([
      { place: bank, kind: "holiday", holiday: independence },
    ]);
  });

  it("is empty on an open day", () => {
    expect(closedReasonsOn(d("2026-10-20"), [bank, souk], closures.holidays)).toEqual([]);
  });
});

describe("checkRange", () => {
  it("flags a single closed day and offers the next open one", () => {
    const result = checkRange(d("2026-10-24"), d("2026-10-24"), [bank], []);
    expect(result?.reasons[0]).toMatchObject({ kind: "weekday", weekday: 6 });
    expect(result?.fix).toEqual({ start: d("2026-10-26"), end: d("2026-10-26") });
  });

  it("flags a weekend and keeps its length when moving it", () => {
    expect(checkRange(d("2026-10-24"), d("2026-10-25"), [bank], [])?.fix).toEqual({
      start: d("2026-10-26"),
      end: d("2026-10-27"),
    });
  });

  it("leaves a range alone when one of its days is open", () => {
    expect(checkRange(d("2026-10-23"), d("2026-10-26"), [bank], [])).toBeNull();
  });

  it("skips a holiday when looking for the next open day", () => {
    // Fri 6 Nov is Green March, then the weekend: Monday 9 Nov is the first open day.
    expect(checkRange(d("2026-11-06"), d("2026-11-06"), [bank], closures.holidays)?.fix?.start).toEqual(d("2026-11-09"));
  });

  it("treats a task at two places as closed when either is", () => {
    // Fri 23 Oct: the bank is open, the souk is not.
    expect(checkRange(d("2026-10-23"), d("2026-10-23"), [bank, souk], [])).not.toBeNull();
  });

  it("offers no fix when the place is never open", () => {
    const never: Place = { ...bank, closed_weekdays: [0, 1, 2, 3, 4, 5, 6] };
    expect(checkRange(d("2026-10-20"), d("2026-10-20"), [never], [])).toEqual({
      day: d("2026-10-20"),
      reasons: [{ place: never, kind: "weekday", weekday: 2 }],
      fix: null,
    });
  });

  it("accepts a reversed range", () => {
    expect(checkRange(d("2026-10-25"), d("2026-10-24"), [bank], [])).not.toBeNull();
  });
});

describe("closedDayWarning", () => {
  const saturday = { start: "2026-10-24", end: "2026-10-24" };

  it("warns when a tagged task's timeline is set to a closed day, with the fix", () => {
    const warning = closedDayWarning(task({ tags: ["banque"] }), board, "tl", saturday, closures);
    expect(warning).toMatchObject({ itemId: "i1", columnId: "tl", fixValue: { start: "2026-10-26", end: "2026-10-26" } });
  });

  it("warns when the tag is added to a task already planned on a closed day", () => {
    expect(closedDayWarning(task({ tl: saturday }), board, "tags", ["bank"], closures)).not.toBeNull();
  });

  it("stays quiet when another tag is added to a task already flagged", () => {
    expect(closedDayWarning(task({ tags: ["bank"], tl: saturday }), board, "tags", ["bank", "urgent"], closures)).toBeNull();
  });

  it("warns again when the dates of a flagged task are picked again", () => {
    const sunday = { start: "2026-10-25", end: "2026-10-25" };
    expect(closedDayWarning(task({ tags: ["bank"], tl: saturday }), board, "tl", sunday, closures)).not.toBeNull();
  });

  it("says nothing for an open day, an untagged task or another column", () => {
    expect(closedDayWarning(task({ tags: ["bank"] }), board, "tl", { start: "2026-10-26", end: "2026-10-26" }, closures)).toBeNull();
    expect(closedDayWarning(task({}), board, "tl", saturday, closures)).toBeNull();
    expect(closedDayWarning(task({ tags: ["bank"], tl: saturday }), board, "st", "Working on it", closures)).toBeNull();
  });

  it("leaves finished tasks alone", () => {
    expect(closedDayWarning(task({ tags: ["bank"], st: "Done" }), board, "tl", saturday, closures)).toBeNull();
  });

  it("keeps other fields of the timeline value in the fix", () => {
    const warning = closedDayWarning(task({ tags: ["bank"] }), board, "tl", { ...saturday, note: "x" }, closures);
    expect(warning?.fixValue).toEqual({ note: "x", start: "2026-10-26", end: "2026-10-26" });
  });
});
