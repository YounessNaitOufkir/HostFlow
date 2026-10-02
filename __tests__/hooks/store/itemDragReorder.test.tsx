import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Item } from "@/types";

const updates: { id: string; patch: Record<string, unknown> }[] = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          updates.push({ id, patch });
          const res = { error: null, data: [{ id }] };
          return Object.assign(Promise.resolve(res), {
            select: () => Promise.resolve(res),
          });
        },
      }),
    }),
  },
}));
vi.mock("@/hooks/useRealtimeSync", () => ({ notifyTabSync: vi.fn() }));
vi.mock("@/lib/errorReporting", () => ({
  reportMutationError: vi.fn(),
  runWrite: vi.fn(),
}));

import { useItemMutations } from "@/hooks/store/useItemMutations";

// Positions 1..5 are what addItem produces (max + 1), so neighbours have no gap.
const makeItems = (): Item[] =>
  ["a", "b", "c", "d", "e"].map(
    (id, i) =>
      ({
        id,
        board_id: "board",
        group_id: "g1",
        name: id,
        position: i + 1,
        column_values: {},
      }) as unknown as Item
  );

const order = (items: Item[]) =>
  items
    .filter((i) => i.group_id === "g1")
    .sort((x, y) => x.position - y.position)
    .map((i) => i.id);

function setup(items: Item[]) {
  const dispatch = vi.fn();
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(
    () =>
      useItemMutations({
        dispatch,
        items,
        trashItems: [],
        itemLinks: [],
        reorderColumns: vi.fn(),
      } as unknown as Parameters<typeof useItemMutations>[0]),
    { wrapper }
  );
  return { result, dispatch };
}

describe("item drag reorder", () => {
  beforeEach(() => {
    updates.length = 0;
  });

  it("moving an item up one row between adjacent positions lands it there, not at the top", async () => {
    const items = makeItems();
    const { result, dispatch } = setup(items);

    await act(async () => {
      await result.current.handleDragEnd(
        {
          draggableId: "d",
          type: "DEFAULT",
          source: { droppableId: "g1", index: 3 },
          destination: { droppableId: "g1", index: 2 },
        },
        null
      );
    });

    const optimistic = dispatch.mock.calls[0][0].payload as Item[];
    expect(order(optimistic)).toEqual(["a", "b", "d", "c", "e"]);

    // The database ends up in the same order as the screen.
    const db = new Map(items.map((i) => [i.id, i.position]));
    for (const u of updates) db.set(u.id, u.patch.position as number);
    const dbOrder = [...db.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
    expect(dbOrder).toEqual(["a", "b", "d", "c", "e"]);
  });

  it("moving an item down between adjacent positions keeps the dropped slot", async () => {
    const items = makeItems();
    const { result, dispatch } = setup(items);

    await act(async () => {
      await result.current.handleDragEnd(
        {
          draggableId: "a",
          type: "DEFAULT",
          source: { droppableId: "g1", index: 0 },
          destination: { droppableId: "g1", index: 2 },
        },
        null
      );
    });

    const optimistic = dispatch.mock.calls[0][0].payload as Item[];
    expect(order(optimistic)).toEqual(["b", "c", "a", "d", "e"]);
  });
});
