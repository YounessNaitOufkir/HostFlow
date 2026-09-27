import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ColumnHeader from "@/components/ColumnHeader";
import CellRenderer from "@/components/cells/CellRenderer";
import GroupFooter from "@/components/GroupFooter";
import { COLUMN_REGISTRY, getColumnWidth } from "@/lib/columnRegistry";
import type { Column, ColumnType, Item } from "@/types";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ in: async () => ({ data: [] }), eq: () => ({ is: async () => ({ count: 0 }) }) }) }),
    storage: { from: () => ({}) },
  },
}));

const item: Item = { id: "i1", board_id: "b1", group_id: "g1", name: "Task", position: 0, column_values: {} };

/** The w-* class on an element, which is how an unresized column gets its width. */
const widthClassOf = (el: Element | null) => el?.className.toString().match(/(?:^|\s)(w-\d+)(?:\s|$)/)?.[1];

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("an unresized column is one width from header to footer", () => {
  const types = Object.keys(COLUMN_REGISTRY) as ColumnType[];

  it.each(types)("%s", (type) => {
    const column: Column = { id: `c-${type}`, title: type, type };
    const expected = getColumnWidth(type);

    const header = wrap(
      <ColumnHeader column={column} dragHandleProps={null} onRename={vi.fn()} onResize={vi.fn()} onDelete={vi.fn()} />
    );
    expect(widthClassOf(header.container.firstElementChild)).toBe(expected);
    header.unmount();

    const cell = wrap(
      <CellRenderer item={item} column={column} activeStatusId={null} setActiveStatusId={vi.fn()} onUpdate={vi.fn()} />
    );
    expect(widthClassOf(cell.container.firstElementChild)).toBe(expected);
    cell.unmount();

    // The footer only shows on a board with a numbers column, placed first here.
    const sum: Column = { id: "sum", title: "Sum", type: "numbers" };
    const footer = wrap(<GroupFooter columns={[sum, column]} items={[item]} groupColor="#579bfc" />);
    const row = footer.container.firstElementChild!;
    // Colour bar, name spacer, the numbers column, then this one.
    expect(widthClassOf(row.children[3])).toBe(expected);
    footer.unmount();
  });
});
