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

describe("a timeline pill on work that is already finished", () => {
  const columns: Column[] = [
    {
      id: "state",
      title: "Status",
      type: "status",
      settings: {
        statusLabels: [
          { label: "Signed off", color: "bg-[#00c875]", semantic: "done" },
          { label: "On site", color: "bg-[#fdab3d]", semantic: "working" },
        ],
      },
    },
    { id: "when", title: "Timeline", type: "timeline" },
  ];

  const past = { start: "2020-03-01", end: "2020-03-06" };

  const renderPill = (state: string) =>
    render(
      <CellRenderer
        item={
          {
            id: "i1",
            board_id: "b1",
            group_id: "g1",
            name: "Strip out",
            position: 0,
            column_values: { state, when: past },
          } as Item
        }
        column={columns[1]}
        columns={columns}
        activeStatusId={null}
        setActiveStatusId={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

  /** The pill carries the colour as a Tailwind class on the element holding the dates. */
  const pillClasses = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("*"))
      .map((el) => el.className)
      .filter((c) => typeof c === "string" && c.includes("bg-["))
      .join(" ");

  it("does not paint a past date red once the board says the work is done", () => {
    // "Signed off" matches no done-pattern in either language, so this only
    // passes if the board's declared labels are being read.
    const { container } = renderPill("Signed off");
    expect(pillClasses(container)).not.toContain("#e44258");
  });

  it("still paints a past date red while the work is unfinished", () => {
    const { container } = renderPill("On site");
    expect(pillClasses(container)).toContain("#e44258");
  });
});
