import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import CellRenderer from "@/components/cells/CellRenderer";
import type { Item, Column } from "@/types";

describe("CellRenderer Dispatcher — Batch 2", () => {
  const mockItem: Item = {
    id: "item-500",
    board_id: "board-1",
    group_id: "group-1",
    name: "Dispatch Task",
    position: 0,
    column_values: {
      text_col: "Hello World",
      num_col: "42.5",
      check_col: false,
    },
  };

  const makeCol = (id: string, type: any, width?: number): Column => ({
    id,
    title: id,
    type,
    width,
  });

  it("routes to TextCell and renders value", () => {
    render(
      <CellRenderer
        item={mockItem}
        column={makeCol("text_col", "text")}
        activeStatusId={null}
        setActiveStatusId={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    const input = screen.getByDisplayValue("Hello World");
    expect(input).toBeInTheDocument();
  });

  it("routes to NumberCell and renders formatted value", () => {
    render(
      <CellRenderer
        item={mockItem}
        column={makeCol("num_col", "numbers")}
        activeStatusId={null}
        setActiveStatusId={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("42.5")).toBeInTheDocument();
  });

  it("routes to CheckboxCell and triggers toggle onUpdate", () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <CellRenderer
        item={mockItem}
        column={makeCol("check_col", "checkbox")}
        activeStatusId={null}
        setActiveStatusId={vi.fn()}
        onUpdate={onUpdate}
      />
    );

    const btn = container.querySelector("button");
    expect(btn).toBeInTheDocument();
    if (btn) {
      fireEvent.click(btn);
      expect(onUpdate).toHaveBeenCalledWith("item-500", "check_col", true);
    }
  });

  it("renders default empty cell fallback for unknown column type", () => {
    const { container } = render(
      <CellRenderer
        item={mockItem}
        column={makeCol("unknown", "non_existent_type" as any)}
        activeStatusId={null}
        setActiveStatusId={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    // Should render fallback empty div with border classes
    expect(container.firstChild).toHaveClass("border-r");
    expect(container.firstChild).toHaveClass("shrink-0");
  });
});
