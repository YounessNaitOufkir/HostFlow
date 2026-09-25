import { describe, it, expect } from "vitest";
import { computePortfolio, portfolioBoards } from "@/lib/dashboard/portfolio";
import type { Board, Item, Profile, Workspace } from "@/types";

const NOW = new Date(2026, 8, 25); // 25 Sep 2026, local midnight

const ws = (id: string, is_private = false): Workspace => ({ id, name: id, created_at: "", is_private });

const COLS = [
  { id: "s", title: "Status", type: "status" },
  { id: "tl", title: "Timeline", type: "timeline" },
  { id: "p", title: "Owner", type: "people" },
] as Board["columns"];

const board = (id: string, workspace_id: string, extra: Partial<Board> = {}): Board => ({
  id, name: `Board ${id}`, description: "", workspace_id, columns: COLS, ...extra,
});

let seq = 0;
const item = (board_id: string, values: Record<string, unknown>, extra: Partial<Item> = {}): Item => ({
  id: `i${++seq}`, group_id: "g", name: `Task ${seq}`, position: seq, board_id, column_values: values, ...extra,
});

const people = [{ id: "u1", full_name: "Amine" }] as Profile[];

describe("portfolioBoards", () => {
  it("keeps shared boards of shared workspaces only", () => {
    const boards = [
      board("a", "shared"),
      board("b", "shared", { is_private: true }),
      board("c", "shared", { is_private: null }),
      board("d", "mine"),
    ];
    const ids = portfolioBoards([ws("shared"), ws("mine", true)], boards).map((b) => b.id);
    expect(ids).toEqual(["a", "c"]);
  });
});

describe("computePortfolio", () => {
  it("excludes private workspaces and boards even when their items are loaded", () => {
    const boards = [board("a", "shared"), board("b", "shared", { is_private: true }), board("c", "mine")];
    const items = [item("a", { s: "Done" }), item("b", { s: "Done" }), item("c", { s: "Done" })];
    const m = computePortfolio([ws("shared"), ws("mine", true)], boards, items, people, NOW);
    expect(m.cards.map((c) => [c.workspace.id, c.total])).toEqual([["shared", 1]]);
  });

  it("gives no card to a workspace with no reachable boards, and 'no tasks' to an empty one", () => {
    const m = computePortfolio([ws("x"), ws("y")], [board("a", "y")], [], people, NOW);
    expect(m.cards.map((c) => c.workspace.id)).toEqual(["y"]);
    expect(m.cards[0].total).toBe(0);
  });

  it("reads French and renamed done labels, and never counts 'Not done' as done", () => {
    const b = board("a", "w");
    const items = [
      item("a", { s: "Terminé", p: ["u1"] }),
      item("a", { s: "Fait", p: ["u1"] }),
      item("a", { s: "Not done", p: ["u1"], tl: { start: "2026-12-01", end: "2026-12-02" } }),
    ];
    const card = computePortfolio([ws("w")], [b], items, people, NOW).cards[0];
    expect(card.done).toBe(2);
    expect(card.open).toBe(1);
    expect(card.donePct).toBe(67);
  });

  it("skips trashed items", () => {
    const items = [item("a", { s: "Done" }), item("a", { s: "Done" }, { deleted_at: "2026-09-01" })];
    expect(computePortfolio([ws("w")], [board("a", "w")], items, people, NOW).cards[0].total).toBe(1);
  });

  it("lists each open task once under its most serious reason, most urgent first", () => {
    const b = board("a", "w");
    const items = [
      item("a", { s: "Working on it", p: ["u1"], tl: { start: "2026-09-01", end: "2026-09-20" } }), // overdue
      item("a", { s: "Stuck", p: ["u1"], tl: { start: "2026-09-01", end: "2026-09-27" } }), // stuck beats due soon
      item("a", { s: "Working on it", p: ["u1"], tl: { start: "2026-09-25", end: "2026-09-25" } }), // due today
      item("a", { p: ["u1"] }), // no status
      item("a", { s: "Working on it" }), // unassigned
      item("a", { s: "Working on it", p: ["u1"], tl: { start: "2026-12-01", end: "2026-12-05" } }), // fine
      item("a", { s: "Done", tl: { start: "2026-01-01", end: "2026-01-02" } }), // done and late: ignored
    ];
    const m = computePortfolio([ws("w")], [b], items, people, NOW);
    expect(m.attention.map((a) => a.reason)).toEqual(["overdue", "stuck", "dueSoon", "noStatus", "unassigned"]);
    expect(m.attention[0].offsetDays).toBe(-5);
    expect(m.attention[2].offsetDays).toBe(0);
    const card = m.cards[0];
    expect([card.overdue, card.stuck, card.attention]).toEqual([1, 1, 5]);
  });

  it("tells a deleted assignee apart from no assignee", () => {
    const items = [
      item("a", { s: "Stuck", p: ["gone", "u1"] }),
      item("a", { s: "Working on it" }),
    ];
    const [stuck, unassigned] = computePortfolio([ws("w")], [board("a", "w")], items, people, NOW).attention;
    expect(stuck).toMatchObject({ ownerName: null, ownerUnknown: true, extraOwners: 1 });
    expect(unassigned).toMatchObject({ ownerName: null, ownerUnknown: false, reason: "unassigned" });
  });

  it("keeps one straggler from stretching the solid part of a timeline", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      item("a", { s: "Done", tl: { start: "2026-02-01", end: `2026-02-${String(10 + i).padStart(2, "0")}` } })
    );
    items[9] = item("a", { s: "Done", tl: { start: "2026-02-01", end: "2026-09-04" } });
    const [span] = computePortfolio([ws("w")], [board("a", "w")], items, people, NOW).spans;
    expect(span.end.getMonth()).toBe(8);
    expect(span.coreEnd.getDate()).toBe(18);
    expect(span.coreDays).toBe(18);
  });

  it("accepts a timeline with only one end, and names workspaces without any dates", () => {
    const boards = [board("a", "w"), board("b", "v")];
    const items = [item("a", { s: "Done", tl: { end: "2026-03-09" } }), item("b", { s: "Done" })];
    const m = computePortfolio([ws("w"), ws("v")], boards, items, people, NOW);
    expect(m.spans).toHaveLength(1);
    expect(m.spans[0].coreDays).toBe(1);
    expect(m.undated.map((w) => w.id)).toEqual(["v"]);
  });
});
