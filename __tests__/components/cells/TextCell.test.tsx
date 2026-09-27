import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import TextCell from "@/components/cells/TextCell";
import type { Item, Column } from "@/types";

const column: Column = { id: "note", title: "Note", type: "text" };
const item = (note: string): Item => ({
  id: "t1",
  board_id: "b1",
  group_id: "g1",
  name: "Task",
  position: 0,
  column_values: { note },
});

describe("TextCell with live updates", () => {
  it("keeps what you are typing when a colleague's edit arrives", () => {
    const onUpdate = vi.fn();
    const { rerender } = render(<TextCell item={item("old")} column={column} onUpdate={onUpdate} />);
    const input = screen.getByDisplayValue("old");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mine" } });
    rerender(<TextCell item={item("theirs")} column={column} onUpdate={onUpdate} />);
    expect(input).toHaveValue("mine");
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith("t1", "note", "mine");
  });

  it("shows a colleague's edit when you are not in the cell", () => {
    const { rerender } = render(<TextCell item={item("old")} column={column} onUpdate={vi.fn()} />);
    rerender(<TextCell item={item("theirs")} column={column} onUpdate={vi.fn()} />);
    expect(screen.getByDisplayValue("theirs")).toBeInTheDocument();
  });

  it("leaving the cell without typing saves nothing, so their edit is not put back", () => {
    const onUpdate = vi.fn();
    const { rerender } = render(<TextCell item={item("old")} column={column} onUpdate={onUpdate} />);
    const input = screen.getByDisplayValue("old");
    fireEvent.focus(input);
    rerender(<TextCell item={item("theirs")} column={column} onUpdate={onUpdate} />);
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(input).toHaveValue("theirs");
  });
});
