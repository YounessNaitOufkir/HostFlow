import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Item, Column } from "@/types";
import { useFilters } from "@/hooks/useFilters";

const TIMELINE_COL = "timeline-col";

const columns: Column[] = [{ id: TIMELINE_COL, title: "Timeline", type: "timeline" }];

function makeItem(id: string, position: number, start: string, end: string): Item {
  return {
    id,
    group_id: "g1",
    name: id,
    board_id: "b1",
    position,
    column_values: { [TIMELINE_COL]: { start, end } },
  };
}

describe("useFilters — timeline sort tie-breaking (Step 11)", () => {
  // Mirrors the real "Travaux" group that reported as unsorted: every item
  // starts on the same day, so the sort must fall back to the end date.
  const items: Item[] = [
    makeItem("mid", 1, "2026-09-12", "2026-09-14"),
    makeItem("earliest-end", 0, "2026-09-12", "2026-09-12"),
    makeItem("latest-end", 2, "2026-09-12", "2026-09-15"),
  ];

  it("breaks ties on the end date when start dates are equal (ascending)", () => {
    const { result } = renderHook(() => useFilters(items, columns));
    act(() => result.current.addSort(TIMELINE_COL, "asc"));

    expect(result.current.filteredItems.map((i) => i.id)).toEqual([
      "earliest-end",
      "mid",
      "latest-end",
    ]);
  });

  it("breaks ties on the end date when start dates are equal (descending)", () => {
    const { result } = renderHook(() => useFilters(items, columns));
    act(() => result.current.addSort(TIMELINE_COL, "desc"));

    expect(result.current.filteredItems.map((i) => i.id)).toEqual([
      "latest-end",
      "mid",
      "earliest-end",
    ]);
  });

  it("still sorts primarily by start date when start dates differ", () => {
    const distinctStarts: Item[] = [
      makeItem("late", 0, "2026-09-09", "2026-09-09"),
      makeItem("early", 1, "2026-09-05", "2026-09-06"),
      makeItem("mid2", 2, "2026-09-08", "2026-09-09"),
    ];
    const { result } = renderHook(() => useFilters(distinctStarts, columns));
    act(() => result.current.addSort(TIMELINE_COL, "asc"));

    expect(result.current.filteredItems.map((i) => i.id)).toEqual(["early", "mid2", "late"]);
  });
});

describe("useFilters — timeline 'is between' filter", () => {
  const items: Item[] = [
    makeItem("before-range", 0, "2026-09-01", "2026-09-02"),
    makeItem("in-range", 1, "2026-09-08", "2026-09-09"),
    makeItem("on-boundary", 2, "2026-09-05", "2026-09-06"),
    makeItem("after-range", 3, "2026-09-20", "2026-09-21"),
  ];

  it("keeps only items whose start date falls within the inclusive range", () => {
    const { result } = renderHook(() => useFilters(items, columns));
    act(() => result.current.addFilter(TIMELINE_COL, "is_between", ["2026-09-05", "2026-09-10"]));

    expect(result.current.filteredItems.map((i) => i.id).sort()).toEqual([
      "in-range",
      "on-boundary",
    ]);
  });
});

describe("useFilters — per-column-type filter operators", () => {
  function itemWith(id: string, columnId: string, value: unknown): Item {
    return {
      id,
      group_id: "g1",
      name: id,
      board_id: "b1",
      position: 0,
      column_values: { [columnId]: value },
    };
  }

  it("numbers: is_between keeps values within the inclusive numeric range", () => {
    const col = "numbers-col";
    const cols: Column[] = [{ id: col, title: "Score", type: "numbers" }];
    const items = [itemWith("low", col, 2), itemWith("mid", col, 5), itemWith("high", col, 9)];
    const { result } = renderHook(() => useFilters(items, cols));
    act(() => result.current.addFilter(col, "is_between", ["3", "8"]));

    expect(result.current.filteredItems.map((i) => i.id)).toEqual(["mid"]);
  });

  it("people: equals keeps items where the array includes the picked person", () => {
    const col = "people-col";
    const cols: Column[] = [{ id: col, title: "Assignee", type: "people" }];
    const items = [
      itemWith("has-alice", col, ["alice", "bob"]),
      itemWith("no-alice", col, ["bob"]),
      itemWith("unassigned", col, []),
    ];
    const { result } = renderHook(() => useFilters(items, cols));
    act(() => result.current.addFilter(col, "equals", "alice"));

    expect(result.current.filteredItems.map((i) => i.id)).toEqual(["has-alice"]);
  });

  it("people: is_empty keeps items with no assignees", () => {
    const col = "people-col";
    const cols: Column[] = [{ id: col, title: "Assignee", type: "people" }];
    const items = [itemWith("assigned", col, ["alice"]), itemWith("unassigned", col, [])];
    const { result } = renderHook(() => useFilters(items, cols));
    act(() => result.current.addFilter(col, "is_empty", ""));

    expect(result.current.filteredItems.map((i) => i.id)).toEqual(["unassigned"]);
  });

  it("tags: 'Is' matches on a partial tag name, not just an exact one", () => {
    const col = "tags-col";
    const cols: Column[] = [{ id: col, title: "Tags", type: "tags" }];
    const items = [
      itemWith("casablanca", col, ["casablanca", "morocco"]),
      itemWith("rabat", col, ["rabat"]),
    ];
    const { result } = renderHook(() => useFilters(items, cols));
    act(() => result.current.addFilter(col, "equals", "casa"));

    expect(result.current.filteredItems.map((i) => i.id)).toEqual(["casablanca"]);
  });

  it("is_empty / is_not_empty filter correctly when added with an empty rule.value", () => {
    const col = "text-col";
    const cols: Column[] = [{ id: col, title: "Notes", type: "text" }];
    const items = [itemWith("has-notes", col, "hello"), itemWith("no-notes", col, "")];

    const { result: empty } = renderHook(() => useFilters(items, cols));
    act(() => empty.current.addFilter(col, "is_empty", ""));
    expect(empty.current.filterRules).toHaveLength(1);
    expect(empty.current.filteredItems.map((i) => i.id)).toEqual(["no-notes"]);

    const { result: notEmpty } = renderHook(() => useFilters(items, cols));
    act(() => notEmpty.current.addFilter(col, "is_not_empty", ""));
    expect(notEmpty.current.filterRules).toHaveLength(1);
    expect(notEmpty.current.filteredItems.map((i) => i.id)).toEqual(["has-notes"]);
  });

  it("checkbox: is_checked/is_not_checked partition correctly", () => {
    const col = "checkbox-col";
    const cols: Column[] = [{ id: col, title: "Done", type: "checkbox" }];
    const items = [itemWith("done", col, true), itemWith("not-done", col, false)];

    const { result: checked } = renderHook(() => useFilters(items, cols));
    act(() => checked.current.addFilter(col, "is_checked", ""));
    expect(checked.current.filteredItems.map((i) => i.id)).toEqual(["done"]);

    const { result: unchecked } = renderHook(() => useFilters(items, cols));
    act(() => unchecked.current.addFilter(col, "is_not_checked", ""));
    expect(unchecked.current.filteredItems.map((i) => i.id)).toEqual(["not-done"]);
  });

  it("link: contains matches against both the url and the label", () => {
    const col = "link-col";
    const cols: Column[] = [{ id: col, title: "Link", type: "link" }];
    const items = [
      itemWith("docs", col, { url: "https://docs.example.com", label: "Docs" }),
      itemWith("blog", col, { url: "https://blog.example.com", label: "Blog" }),
    ];
    const { result } = renderHook(() => useFilters(items, cols));
    act(() => result.current.addFilter(col, "contains", "docs"));

    expect(result.current.filteredItems.map((i) => i.id)).toEqual(["docs"]);
  });

  it("files: is_not_empty keeps only items with at least one attachment", () => {
    const col = "files-col";
    const cols: Column[] = [{ id: col, title: "Files", type: "files" }];
    const items = [itemWith("has-file", col, ["a.pdf"]), itemWith("no-file", col, [])];
    const { result } = renderHook(() => useFilters(items, cols));
    act(() => result.current.addFilter(col, "is_not_empty", ""));

    expect(result.current.filteredItems.map((i) => i.id)).toEqual(["has-file"]);
  });
});
