import { describe, it, expect } from "vitest";
import { applyColumnOrder, moveVisibleColumn } from "@/lib/columnOrder";
import type { Column } from "@/types";

const col = (id: string) => ({ id, title: id, type: "text" }) as Column;
const ids = (cols: Column[]) => cols.map((c) => c.id);
const board = ["timeline", "owner", "dependency", "status"].map(col);

describe("applyColumnOrder", () => {
  it("returns the board's shared order when there is no preference", () => {
    expect(ids(applyColumnOrder(board, undefined))).toEqual(["timeline", "owner", "dependency", "status"]);
    expect(ids(applyColumnOrder(board, []))).toEqual(["timeline", "owner", "dependency", "status"]);
  });

  it("applies the saved order", () => {
    const order = ["owner", "dependency", "timeline", "status"];
    expect(ids(applyColumnOrder(board, order))).toEqual(order);
  });

  it("ignores saved ids for columns that were deleted", () => {
    const order = ["owner", "gone", "dependency", "timeline", "status"];
    expect(ids(applyColumnOrder(board, order))).toEqual(["owner", "dependency", "timeline", "status"]);
  });

  it("places a column added since next to the column it follows on the board", () => {
    // Someone added "budget" after "dependency" on the shared board.
    const withNew = ["timeline", "owner", "dependency", "budget", "status"].map(col);
    const order = ["owner", "dependency", "timeline", "status"];
    expect(ids(applyColumnOrder(withNew, order))).toEqual([
      "owner",
      "dependency",
      "budget",
      "timeline",
      "status",
    ]);
  });

  it("puts a new first column first", () => {
    const withNew = ["notes", "timeline", "owner", "dependency", "status"].map(col);
    expect(ids(applyColumnOrder(withNew, ["status", "timeline", "owner", "dependency"]))[0]).toBe("notes");
  });
});

describe("moveVisibleColumn", () => {
  it("moves timeline to the right of dependency", () => {
    expect(moveVisibleColumn(board, [], 0, 2)).toEqual(["owner", "dependency", "timeline", "status"]);
  });

  it("counts drag indices among visible columns only", () => {
    // owner is hidden, so the header shows timeline, dependency, status.
    // Dragging visible index 2 (status) to visible index 0 must move status,
    // not dependency, and leave the hidden column in its slot.
    expect(moveVisibleColumn(board, ["owner"], 2, 0)).toEqual(["status", "owner", "timeline", "dependency"]);
  });

  it("ignores an out-of-range start index", () => {
    expect(moveVisibleColumn(board, [], 9, 0)).toEqual(["timeline", "owner", "dependency", "status"]);
  });
});
