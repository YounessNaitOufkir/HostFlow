import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { Board, Column, Group, Item, Workspace } from "@/types";
import type { DelayNote } from "@/lib/delays";

let mockNotes: DelayNote[] = [];
let mockGroups: Group[] = [];
vi.mock("@/hooks/useDelayNotes", () => ({
  useDelayNotes: () => ({ notes: mockNotes, byItem: new Map(), add: vi.fn(), update: vi.fn(), remove: vi.fn() }),
}));
vi.mock("@/hooks/useLessonsData", () => ({
  usePortfolioGroups: () => mockGroups,
}));

import LessonsTab from "@/components/portfolio/LessonsTab";

const TL: Column = { id: "tl", title: "Timeline", type: "timeline" };
const ST: Column = { id: "st", title: "Status", type: "status" };

/** Three finished apartments; Plomberie planned at 5 days, took 8, 7 and 7. */
function portfolio() {
  const workspaces: Workspace[] = [];
  const boards: Board[] = [];
  const groups: Group[] = [];
  const items: Item[] = [];
  [8, 7, 7].forEach((days, i) => {
    const n = i + 1;
    workspaces.push({ id: `w${n}`, name: `Appartement ${n}`, is_private: false } as Workspace);
    boards.push({ id: `b${n}`, name: "Rénovation", description: "", columns: [TL, ST], workspace_id: `w${n}` });
    groups.push({ id: `g${n}`, title: "Travaux", color: "#579bfc", position: 0, board_id: `b${n}` });
    items.push({
      id: `p${n}`,
      name: "Plomberie",
      group_id: `g${n}`,
      board_id: `b${n}`,
      position: 0,
      column_values: { tl: { start: "2026-09-01", end: `2026-09-${String(days).padStart(2, "0")}` }, st: "Done" },
      baseline: { start: "2026-09-01", end: "2026-09-05", captured_at: "" },
    } as Item);
  });
  return { workspaces, boards, groups, items };
}

beforeEach(() => {
  localStorage.clear();
  mockNotes = [];
});

describe("LessonsTab", () => {
  it("adds up finished projects and gives advice from them", () => {
    const { workspaces, boards, groups, items } = portfolio();
    mockGroups = groups;
    mockNotes = [
      {
        id: "n1",
        item_id: "p1",
        board_id: "b1",
        days: 3,
        category: "supplier",
        note: "Pipes late",
        created_by: "u1",
        created_at: "2026-09-10T00:00:00Z",
        updated_at: "2026-09-10T00:00:00Z",
      },
    ];
    render(<LessonsTab workspaces={workspaces} boards={boards} items={items} onOpenReview={() => {}} />);

    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getByText("3")).toBeInTheDocument();
    expect(within(summary).getByText("7")).toBeInTheDocument(); // 3 + 2 + 2 days lost
    expect(screen.getByText("Plan Plomberie at 7 days, not 5")).toBeInTheDocument();
    expect(screen.getByText(/Most common reason: Supplier \/ delivery/)).toBeInTheDocument();
    // The first task type opens with its runs; Appartement 1's carries the note.
    expect(screen.getByText("Pipes late")).toBeInTheDocument();
  });

  it("opens a project's own review", async () => {
    const user = userEvent.setup();
    const { workspaces, boards, groups, items } = portfolio();
    mockGroups = groups;
    const opened: string[] = [];
    render(<LessonsTab workspaces={workspaces} boards={boards} items={items} onOpenReview={(b) => opened.push(b.id)} />);
    await user.click(screen.getAllByRole("button", { name: "Review →" })[0]);
    expect(opened).toHaveLength(1);
  });

  it("filters to one workspace and remembers it", async () => {
    const user = userEvent.setup();
    const { workspaces, boards, groups, items } = portfolio();
    mockGroups = groups;
    render(<LessonsTab workspaces={workspaces} boards={boards} items={items} onOpenReview={() => {}} />);
    await user.selectOptions(screen.getByLabelText("Workspace"), "w2");
    expect(screen.getAllByRole("button", { name: "Review →" })).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("hostflow_lessons_filter")!).workspaceId).toBe("w2");
    // One project is not enough history for advice.
    expect(screen.getByText(/Not enough history yet/)).toBeInTheDocument();
  });

  it("says what is missing when nothing has finished yet", () => {
    const { workspaces, boards, groups, items } = portfolio();
    mockGroups = groups;
    const open = items.map((i) => ({ ...i, column_values: { tl: i.column_values.tl } }));
    render(<LessonsTab workspaces={workspaces} boards={boards} items={open} onOpenReview={() => {}} />);
    expect(screen.getByText("No projects to learn from yet")).toBeInTheDocument();
  });
});
