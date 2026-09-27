import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { Profile } from "@/types";
import type { DelayNote } from "@/lib/delays";
import { DelayNotesSection } from "@/components/delays/DelayNotesSection";
import { DelayPrompt } from "@/components/delays/DelayPrompt";

const note = (over: Partial<DelayNote> = {}): DelayNote => ({
  id: "n1",
  item_id: "i1",
  board_id: "b1",
  days: 3,
  category: "supplier",
  note: "Tiles arrived late",
  created_by: "u1",
  created_at: "2026-03-10T09:00:00Z",
  updated_at: "2026-03-10T09:00:00Z",
  ...over,
});
const profiles = [{ id: "u1", full_name: "Amina Idrissi" }] as Profile[];

describe("DelayNotesSection", () => {
  it("says how far behind the task is and how much is unexplained", () => {
    render(<DelayNotesSection slip={4} notes={[note()]} profiles={profiles} />);
    expect(screen.getByText("4 days behind plan")).toBeInTheDocument();
    expect(screen.getByText(/1 day not explained/)).toBeInTheDocument();
    expect(screen.getByText("Supplier / delivery")).toBeInTheDocument();
    expect(screen.getByText("Tiles arrived late")).toBeInTheDocument();
    expect(screen.getByText(/Amina Idrissi/)).toBeInTheDocument();
  });

  it("adds a reason, pre-filled with the unexplained days", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(true);
    render(<DelayNotesSection slip={4} notes={[note()]} onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: /Add a reason/ }));
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
    // A reason is required before saving.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Rework / quality" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "Wall redone");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onAdd).toHaveBeenCalledWith({ days: 1, category: "rework", note: "Wall redone" });
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("records a note on finishing early as negative days", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(true);
    render(<DelayNotesSection slip={-2} notes={[]} onAdd={onAdd} />);
    expect(screen.getByText("2 days ahead of plan")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add a note/ }));
    await user.click(screen.getByRole("radio", { name: "Other" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onAdd).toHaveBeenCalledWith({ days: -2, category: "other", note: "" });
  });

  it("lets only the author edit or delete a note", () => {
    const { rerender } = render(
      <DelayNotesSection slip={3} notes={[note()]} currentUserId="u2" onUpdate={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    rerender(
      <DelayNotesSection slip={3} notes={[note()]} currentUserId="u1" onUpdate={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("keeps the form open when saving fails", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(false);
    render(<DelayNotesSection slip={2} notes={[]} onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: /Add a reason/ }));
    await user.click(screen.getByRole("radio", { name: "Other" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("DelayPrompt", () => {
  const item = { id: "i1", name: "Plomberie" } as never;

  it("asks why, with the days it just slipped", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<DelayPrompt request={{ item, boardId: "b1", days: 3 }} onSave={onSave} onSkip={vi.fn()} />);
    expect(screen.getByText("Plomberie is now 3 days behind plan")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Supplier / delivery" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ days: 3, category: "supplier", note: "" });
  });

  it("can be skipped", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(<DelayPrompt request={{ item, boardId: "b1", days: 1 }} onSave={vi.fn()} onSkip={onSkip} />);
    expect(screen.getByText("Plomberie is now 1 day behind plan")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Skip" })[0]);
    expect(onSkip).toHaveBeenCalled();
  });
});
