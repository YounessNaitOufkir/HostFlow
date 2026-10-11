import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import WaitingOnCell from "@/components/cells/WaitingOnCell";
import { toDateOnly, today } from "@/lib/gantt/dates";
import type { Column, Item } from "@/types";

const column: Column = { id: "w", title: "Waiting on", type: "waiting_on" };
const item = (w: unknown): Item => ({
  id: "t1",
  board_id: "b1",
  group_id: "g1",
  name: "Task",
  position: 0,
  column_values: { w },
});

describe("WaitingOnCell", () => {
  it("shows who and the follow-up date", () => {
    render(
      <WaitingOnCell
        item={item({ who: "Banque", since: "2026-10-06", followUp: "2026-10-09" })}
        column={column}
        onUpdate={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue("Banque")).toBeInTheDocument();
    // "9 Oct" or "Oct 9" depending on the default locale.
    expect(screen.getByText(/^(9 Oct|Oct 9)$/)).toBeInTheDocument();
  });

  it("saves who on blur and stamps since with today when the cell was empty", () => {
    const onUpdate = vi.fn();
    render(<WaitingOnCell item={item(null)} column={column} onUpdate={onUpdate} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: " Menuisier " } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith("t1", "w", { who: "Menuisier", since: toDateOnly(today()), followUp: null });
  });

  it("keeps since and the follow-up when renaming who", () => {
    const onUpdate = vi.fn();
    render(<WaitingOnCell item={item({ who: "Banque", since: "2026-10-01", followUp: "2026-10-09" })} column={column} onUpdate={onUpdate} />);
    const input = screen.getByDisplayValue("Banque");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Banque CIH" } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith("t1", "w", { who: "Banque CIH", since: "2026-10-01", followUp: "2026-10-09" });
  });

  it("writes nothing when left unchanged", () => {
    const onUpdate = vi.fn();
    render(<WaitingOnCell item={item({ who: "Banque", since: "2026-10-01", followUp: null })} column={column} onUpdate={onUpdate} />);
    const input = screen.getByDisplayValue("Banque");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("clears the cell to null when who is erased", () => {
    const onUpdate = vi.fn();
    render(<WaitingOnCell item={item({ who: "Banque", since: "2026-10-01", followUp: null })} column={column} onUpdate={onUpdate} />);
    const input = screen.getByDisplayValue("Banque");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith("t1", "w", null);
  });

  it("clears the cell with the × button", () => {
    const onUpdate = vi.fn();
    render(<WaitingOnCell item={item({ who: "Banque", since: "2026-10-01", followUp: null })} column={column} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onUpdate).toHaveBeenCalledWith("t1", "w", null);
  });

  it("keeps what is being typed when a colleague's edit arrives, and shows theirs otherwise", () => {
    const onUpdate = vi.fn();
    const { rerender } = render(
      <WaitingOnCell item={item({ who: "Banque", since: "2026-10-01", followUp: null })} column={column} onUpdate={onUpdate} />
    );
    const input = screen.getByDisplayValue("Banque");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Mine" } });
    rerender(<WaitingOnCell item={item({ who: "Theirs", since: "2026-10-01", followUp: null })} column={column} onUpdate={onUpdate} />);
    expect(input).toHaveValue("Mine");
    fireEvent.blur(input);
    rerender(<WaitingOnCell item={item({ who: "Later", since: "2026-10-01", followUp: null })} column={column} onUpdate={onUpdate} />);
    expect(input).toHaveValue("Later");
  });

  it("renders empty, not crashing, on a malformed value", () => {
    render(<WaitingOnCell item={item("{bad")} column={column} onUpdate={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});
