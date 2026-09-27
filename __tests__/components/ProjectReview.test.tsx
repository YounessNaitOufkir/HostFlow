import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { Board, Column, Group, Item, ItemLink } from "@/types";
import type { DelayNote } from "@/lib/delays";

let mockNotes: DelayNote[] = [];
vi.mock("@/hooks/useDelayNotes", () => ({
  useDelayNotes: () => ({
    notes: mockNotes,
    byItem: new Map(),
    add: async () => true,
    update: async () => true,
    remove: async () => true,
  }),
}));

import ProjectReview from "@/components/ProjectReview";

const TL: Column = { id: "tl", title: "Timeline", type: "timeline" };
const board: Board = { id: "b1", name: "Apt", description: "", columns: [TL] };
const groups: Group[] = [{ id: "g1", title: "Travaux", color: "#579bfc", position: 0, board_id: "b1" }];

function task(id: string, name: string, start: string, end: string, baseline?: [string, string], position = 0): Item {
  return {
    id,
    name,
    group_id: "g1",
    board_id: "b1",
    position,
    column_values: { tl: { start, end } },
    ...(baseline ? { baseline: { start: baseline[0], end: baseline[1], captured_at: "2026-01-01T00:00:00Z" } } : {}),
  } as Item;
}

const items = [
  task("a", "Plomberie", "2026-03-01", "2026-03-08", ["2026-03-01", "2026-03-05"], 0),
  task("b", "Peinture", "2026-03-09", "2026-03-13", ["2026-03-06", "2026-03-10"], 1),
  task("c", "Nettoyage", "2026-03-02", "2026-03-03", ["2026-03-02", "2026-03-05"], 2),
];
const links: ItemLink[] = [
  {
    id: "l1",
    source_item_id: "a",
    target_item_id: "b",
    link_type: "dependency",
    dep_type: "FS",
    lag_days: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
];

function renderReview(overrides: Partial<React.ComponentProps<typeof ProjectReview>> = {}) {
  return render(
    <ProjectReview
      board={board}
      groups={groups}
      items={items}
      itemLinks={links}
      onOpenItem={() => {}}
      onGoToGantt={() => {}}
      {...overrides}
    />
  );
}

describe("ProjectReview", () => {
  it("compares the finish with the plan", () => {
    mockNotes = [];
    renderReview();
    expect(screen.getByText("Planned finish")).toBeInTheDocument();
    expect(screen.getAllByText("10 Mar 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("13 Mar 2026").length).toBeGreaterThan(0);
    expect(screen.getByText("3 days late")).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("adds up the days lost by reason, and shows what is unexplained", () => {
    mockNotes = [
      {
        id: "n1",
        item_id: "a",
        board_id: "b1",
        days: 2,
        category: "supplier",
        note: "Pipes late",
        created_by: "u1",
        created_at: "2026-03-05T00:00:00Z",
        updated_at: "2026-03-05T00:00:00Z",
      },
    ];
    renderReview();
    const bars = screen.getByRole("list", { name: "Days lost by reason" });
    expect(bars).toHaveTextContent("Supplier / delivery");
    expect(bars).toHaveTextContent("2 days");
    // Plomberie: 1 of its 3 days unexplained. Peinture's 3 days were all
    // pushed on by Plomberie, so they are not asked about a second time.
    expect(bars).toHaveTextContent("Not explained");
    expect(bars).toHaveTextContent("1 day");
    expect(screen.getByText("3d from earlier")).toBeInTheDocument();
    expect(screen.getByText(/Pipes late/)).toBeInTheDocument();
  });

  it("names the delays that moved the finish, and opens a task from them", async () => {
    mockNotes = [];
    const user = userEvent.setup();
    const opened: string[] = [];
    renderReview({ onOpenItem: (item) => opened.push(item.id) });
    const moved = screen.getByRole("button", { name: /Peinture/ });
    await user.click(moved);
    expect(opened).toEqual(["b"]);
  });

  it("explains what is missing without a baseline", async () => {
    mockNotes = [];
    const user = userEvent.setup();
    const toGantt = vi.fn();
    renderReview({ items: [task("a", "Plomberie", "2026-03-01", "2026-03-08")], onGoToGantt: toGantt });
    expect(screen.getByText("No plan to compare with")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open the Gantt" }));
    expect(toGantt).toHaveBeenCalled();
  });

  it("says so when every task kept its plan", () => {
    mockNotes = [];
    renderReview({ items: [task("c", "Nettoyage", "2026-03-02", "2026-03-03", ["2026-03-02", "2026-03-05"])] });
    expect(screen.getByText(/Every task with a plan finished on or before it/)).toBeInTheDocument();
  });
});
