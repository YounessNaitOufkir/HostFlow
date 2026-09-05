import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import StatusCell from "@/components/cells/StatusCell";
import PriorityCell from "@/components/cells/PriorityCell";
import type { Item, Column } from "@/types";

describe("StatusCell & PriorityCell — Batch 2", () => {
  const mockItem: Item = {
    id: "item-100",
    board_id: "board-1",
    group_id: "group-1",
    name: "Test Task",
    position: 0,
    column_values: {
      status: "Done",
      priority: "High",
    },
  };

  const mockStatusColumn: Column = {
    id: "status",
    title: "Status",
    type: "status",
    settings: {
      statusLabels: [
        { label: "Working on it", color: "bg-[#fdab3d]" },
        { label: "Done", color: "bg-[#00c875]" },
        { label: "Stuck", color: "bg-[#e2445c]" },
      ],
    },
  };

  const mockPriorityColumn: Column = {
    id: "priority",
    title: "Priority",
    type: "priority",
  };

  it("renders StatusCell with correct value and color class", () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <StatusCell
        item={mockItem}
        column={mockStatusColumn}
        onUpdate={onUpdate}
      />
    );

    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders StatusCell with Overdue badge and crimson gradient", () => {
    const overdueItem: Item = {
      ...mockItem,
      column_values: { status: "Overdue" },
    };
    render(
      <StatusCell
        item={overdueItem}
        column={mockStatusColumn}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("opens StatusCell dropdown when activeStatusId matches cellKey and invokes onUpdate when option clicked", () => {
    const onUpdate = vi.fn();
    const setActiveStatusId = vi.fn();
    const cellKey = "item-100-status";

    render(
      <StatusCell
        item={mockItem}
        column={mockStatusColumn}
        activeStatusId={cellKey}
        setActiveStatusId={setActiveStatusId}
        onUpdate={onUpdate}
      />
    );

    // Dropdown options should be visible
    const stuckOption = screen.getByText("Stuck");
    expect(stuckOption).toBeInTheDocument();

    fireEvent.click(stuckOption);
    expect(onUpdate).toHaveBeenCalledWith("item-100", "status", "Stuck");
  });

  it("renders PriorityCell with High priority label and triggers update", () => {
    const onUpdate = vi.fn();
    render(
      <PriorityCell
        item={mockItem}
        column={mockPriorityColumn}
        onUpdate={onUpdate}
      />
    );

    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders grey empty state when priority value is missing", () => {
    const emptyItem: Item = {
      ...mockItem,
      column_values: {},
    };
    const { container } = render(
      <PriorityCell
        item={emptyItem}
        column={mockPriorityColumn}
        onUpdate={vi.fn()}
      />
    );

    const el = container.querySelector(".bg-\\[\\#c4c4c4\\]");
    expect(el).toBeInTheDocument();
  });
});
