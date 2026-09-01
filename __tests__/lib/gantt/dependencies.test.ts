import { describe, it, expect } from "vitest";
import type { Board, Item, ItemLink, LinkType } from "@/types";
import {
  collectDependencies,
  parseDependencyCell,
} from "@/lib/gantt/dependencies";

const DEP_COL = { id: "col-dep", title: "Depends on", type: "dependency" as const };
const TIMELINE = { id: "col-timeline", title: "Works", type: "timeline" as const };

const board: Board = {
  id: "b1",
  name: "Lancement",
  description: "",
  columns: [TIMELINE, DEP_COL],
};

const boardsById = new Map([[board.id, board]]);

function item(id: string, dependsOn?: unknown): Item {
  return {
    id,
    name: id,
    group_id: "g1",
    board_id: "b1",
    position: 0,
    column_values: dependsOn === undefined ? {} : { [DEP_COL.id]: dependsOn },
  };
}

function link(
  id: string,
  source: string,
  target: string,
  extra: Partial<ItemLink> = {}
): ItemLink {
  return {
    id,
    source_item_id: source,
    target_item_id: target,
    link_type: "dependency" as LinkType,
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

describe("parseDependencyCell", () => {
  it("reads an array of ids", () => {
    expect(parseDependencyCell(["a", "b"])).toEqual(["a", "b"]);
  });

  it("reads ids still stored as a JSON string", () => {
    expect(parseDependencyCell('["a","b"]')).toEqual(["a", "b"]);
  });

  it("reads a single bare id", () => {
    expect(parseDependencyCell("a")).toEqual(["a"]);
  });

  it("returns nothing for empty or malformed values", () => {
    expect(parseDependencyCell(null)).toEqual([]);
    expect(parseDependencyCell(undefined)).toEqual([]);
    expect(parseDependencyCell("")).toEqual([]);
    expect(parseDependencyCell([])).toEqual([]);
    expect(parseDependencyCell(42)).toEqual([]);
  });

  it("keeps a malformed JSON string as a literal id rather than throwing", () => {
    expect(parseDependencyCell("[not json")).toEqual(["[not json"]);
  });

  it("drops non-string entries", () => {
    expect(parseDependencyCell(["a", null, 3, "b"])).toEqual(["a", "b"]);
  });
});

describe("collectDependencies", () => {
  it("reads dependencies off the item's column", () => {
    // The column means "this item depends on these", so the arrow runs from
    // each listed id into the item.
    const deps = collectDependencies([item("A"), item("B", ["A"])], boardsById, []);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ sourceId: "A", targetId: "B", type: "FS", lag: 0 });
  });

  it("reads dependencies out of item_links", () => {
    const deps = collectDependencies(
      [item("A"), item("B")],
      boardsById,
      [link("l1", "A", "B", { dep_type: "SS", lag_days: 2 })]
    );
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ sourceId: "A", targetId: "B", type: "SS", lag: 2 });
  });

  it("counts a dependency recorded in both places only once", () => {
    // DependencyCell writes the column and the link row separately and
    // non-transactionally, so the same edge routinely exists twice.
    const deps = collectDependencies(
      [item("A"), item("B", ["A"])],
      boardsById,
      [link("l1", "A", "B")]
    );
    expect(deps).toHaveLength(1);
  });

  it("prefers the link row, because only it can carry a type and a lag", () => {
    const deps = collectDependencies(
      [item("A"), item("B", ["A"])],
      boardsById,
      [link("l1", "A", "B", { dep_type: "FF", lag_days: -3 })]
    );
    expect(deps[0]).toMatchObject({ type: "FF", lag: -3, id: "l1" });
  });

  it("treats a link written before types existed as finish-to-start", () => {
    const deps = collectDependencies([item("A"), item("B")], boardsById, [
      link("l1", "A", "B"),
    ]);
    expect(deps[0]).toMatchObject({ type: "FS", lag: 0 });
  });

  it("falls back to finish-to-start for a value that is not a known type", () => {
    const deps = collectDependencies([item("A"), item("B")], boardsById, [
      link("l1", "A", "B", { dep_type: "nonsense" as never }),
    ]);
    expect(deps[0].type).toBe("FS");
  });

  it("ignores links that are not dependencies", () => {
    const deps = collectDependencies([item("A"), item("B")], boardsById, [
      link("l1", "A", "B", { link_type: "relation" }),
      link("l2", "A", "B", { link_type: "subitem" }),
    ]);
    expect(deps).toHaveLength(0);
  });

  it("drops an edge pointing at an item that is not on the chart", () => {
    const deps = collectDependencies([item("A")], boardsById, [
      link("l1", "A", "elsewhere"),
      link("l2", "elsewhere", "A"),
    ]);
    expect(deps).toHaveLength(0);
  });

  it("drops a self-dependency", () => {
    const deps = collectDependencies([item("A", ["A"])], boardsById, [link("l1", "A", "A")]);
    expect(deps).toHaveLength(0);
  });

  it("keeps the two directions of a pair apart", () => {
    const deps = collectDependencies([item("A"), item("B")], boardsById, [
      link("l1", "A", "B"),
      link("l2", "B", "A"),
    ]);
    expect(deps).toHaveLength(2);
  });

  it("reads across boards, which is what a portfolio chart needs", () => {
    const other: Board = { ...board, id: "b2", name: "Communication" };
    const crossBoard = new Map([
      [board.id, board],
      [other.id, other],
    ]);
    const items = [item("A"), { ...item("B"), board_id: "b2" }];

    const deps = collectDependencies(items, crossBoard, [link("l1", "A", "B")]);
    expect(deps).toHaveLength(1);
  });

  it("copes with an item whose board is not loaded", () => {
    const orphan = { ...item("A", ["Z"]), board_id: "gone" };
    expect(() => collectDependencies([orphan], boardsById, [])).not.toThrow();
    expect(collectDependencies([orphan], boardsById, [])).toHaveLength(0);
  });
});
