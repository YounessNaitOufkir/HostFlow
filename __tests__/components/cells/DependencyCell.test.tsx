import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import React, { useState } from "react";
import type { Item, Column } from "@/types";

vi.mock("@/lib/supabase", () => {
  const chain = { delete: () => chain, insert: () => chain, eq: () => chain, then: () => undefined };
  return { supabase: { from: () => chain } };
});
vi.mock("@/hooks/useBoardStore", () => ({ useBoardStore: () => ({}) }));
vi.mock("@/hooks/queries/useGlobalQueries", () => ({
  useBoardsQuery: () => ({ data: [{ id: "board-1", name: "Board", workspace_id: "ws-1" }] }),
  useWorkspacesQuery: () => ({ data: [{ id: "ws-1", name: "Shared", is_private: false }] }),
}));
vi.mock("@/hooks/queries/useDependencySearch", () => ({
  useDependencyItemSearch: () => ({ data: [], isFetching: false }),
  useItemsByIds: () => ({ data: [] }),
  MIN_SEARCH_LENGTH: 2,
}));

import DependencyCell from "@/components/cells/DependencyCell";
import { en } from "@/lib/i18n/en";

const TL = "tl";
const DEP = "dep";
const columns: Column[] = [
  { id: TL, title: "Timeline", type: "timeline" },
  { id: DEP, title: "Dependency", type: "dependency" },
];
const task = (id: string, name: string, timeline?: { start: string; end: string }): Item => ({
  id,
  board_id: "board-1",
  group_id: "g",
  name,
  position: 0,
  column_values: timeline ? { [TL]: timeline } : {},
});

/**
 * Stands in for the board: every save first closes whatever picker is open,
 * exactly as updateCell does, then applies the value.
 */
function Board({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [active, setActive] = useState<string | null>(null);
  const onUpdate = (itemId: string, columnId: string, value: unknown) => {
    setActive(null);
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, column_values: { ...i.column_values, [columnId]: value } } : i))
    );
  };
  const me = items[0];
  return (
    <>
      <DependencyCell
        item={me}
        column={columns[1]}
        columns={columns}
        boardItems={items}
        onUpdate={onUpdate}
        activeStatusId={active}
        setActiveStatusId={setActive}
      />
      <output data-testid="deps">{JSON.stringify(me.column_values[DEP] ?? [])}</output>
      <output data-testid="dates">{JSON.stringify(me.column_values[TL] ?? null)}</output>
    </>
  );
}

const pickerOpen = () => screen.queryByRole("textbox") !== null;
const pick = (name: string) =>
  fireEvent.click(within(document.querySelector(".dropdown-menu") as HTMLElement).getByText(name));

describe("DependencyCell — linking several tasks", () => {
  it("stays open while dependencies are added and removed", async () => {
    render(<Board initial={[task("me", "Me"), task("a", "Alpha"), task("b", "Beta")]} />);
    fireEvent.click(screen.getByRole("button"));
    expect(pickerOpen()).toBe(true);

    await act(async () => pick("Alpha"));
    expect(pickerOpen()).toBe(true);
    await act(async () => pick("Beta"));
    expect(pickerOpen()).toBe(true);
    expect(JSON.parse(screen.getByTestId("deps").textContent!)).toEqual(["a", "b"]);

    await act(async () => pick("Alpha"));
    expect(pickerOpen()).toBe(true);
    expect(JSON.parse(screen.getByTestId("deps").textContent!)).toEqual(["b"]);

    // A click outside still closes it.
    await act(async () => {
      fireEvent.mouseDown(document.body);
    });
    expect(pickerOpen()).toBe(false);
  });

  it("stays open through the date-conflict prompt and its Adjust button", async () => {
    render(
      <Board
        initial={[
          task("me", "Me", { start: "2026-10-10", end: "2026-10-12" }),
          task("late", "Late", { start: "2026-10-15", end: "2026-10-20" }),
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button"));
    await act(async () => pick("Late"));

    // The prompt is portaled to <body>; pressing its button must not count as
    // a click outside the picker.
    const prompt = document.querySelector("[data-dependency-prompt]") as HTMLElement;
    const adjust = within(prompt).getByRole("button", { name: en["dep.conflictAdjust"] });
    await act(async () => {
      fireEvent.mouseDown(adjust);
      fireEvent.click(adjust);
    });

    expect(pickerOpen()).toBe(true);
    expect(JSON.parse(screen.getByTestId("deps").textContent!)).toEqual(["late"]);
    expect(JSON.parse(screen.getByTestId("dates").textContent!)).toEqual({ start: "2026-10-21", end: "2026-10-23" });
  });
});
