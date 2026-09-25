import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import PortfolioOverview from "@/components/PortfolioOverview";
import type { Board, Item, Profile, Workspace } from "@/types";

const hookState = vi.hoisted(() => ({
  value: { items: [] as unknown[], loading: false, error: null as unknown, retry: () => {} },
  boardsAsked: [] as string[][],
}));

vi.mock("@/hooks/usePortfolioData", () => ({
  usePortfolioData: (boards: { id: string }[]) => {
    hookState.boardsAsked.push(boards.map((b) => b.id));
    return hookState.value;
  },
}));

const COLS = [
  { id: "s", title: "Status", type: "status" },
  { id: "tl", title: "Timeline", type: "timeline" },
  { id: "p", title: "Owner", type: "people" },
] as Board["columns"];

const workspaces = [
  { id: "w-c", name: "App C", is_private: false },
  { id: "w-d", name: "App D", is_private: false },
  { id: "w-mine", name: "My private", is_private: true },
] as Workspace[];

const boards = [
  { id: "b-c", name: "Lancement", workspace_id: "w-c", columns: COLS },
  { id: "b-d", name: "Lancement", workspace_id: "w-d", columns: COLS },
  { id: "b-secret", name: "Secret", workspace_id: "w-d", is_private: true, columns: COLS },
  { id: "b-mine", name: "Mine", workspace_id: "w-mine", columns: COLS },
] as Board[];

const profiles = [{ id: "u1", full_name: "Amine" }] as Profile[];

const item = (id: string, board_id: string, column_values: Record<string, unknown>): Item =>
  ({ id, name: id, board_id, group_id: "g", position: 0, column_values }) as Item;

const items = [
  item("Pose cuisine", "b-c", { s: "Working on it", p: ["u1"], tl: { start: "2026-01-10", end: "2026-01-20" } }),
  item("Peinture", "b-c", { s: "Done", p: ["u1"], tl: { start: "2026-01-05", end: "2026-02-01" } }),
  item("Ménage", "b-d", { s: "Done", p: ["u1"], tl: { start: "2026-02-09", end: "2026-03-09" } }),
];

function renderPortfolio(overrides: Partial<React.ComponentProps<typeof PortfolioOverview>> = {}) {
  const onOpenWorkspace = vi.fn();
  const onOpenTask = vi.fn();
  render(
    <PortfolioOverview
      workspaces={workspaces}
      boards={boards}
      profiles={profiles}
      isTeam
      onOpenWorkspace={onOpenWorkspace}
      onOpenTask={onOpenTask}
      {...overrides}
    />
  );
  return { onOpenWorkspace, onOpenTask };
}

describe("PortfolioOverview", () => {
  beforeEach(() => {
    hookState.value = { items, loading: false, error: null, retry: () => {} };
    hookState.boardsAsked = [];
  });

  it("never asks for private workspaces or private boards", () => {
    renderPortfolio();
    expect(hookState.boardsAsked.at(-1)?.sort()).toEqual(["b-c", "b-d"]);
    expect(screen.queryByText("My private")).toBeNull();
  });

  it("shows a card per shared workspace and opens it on click", () => {
    const { onOpenWorkspace } = renderPortfolio();
    expect(screen.getByText("1 of 2 done")).toBeTruthy();
    expect(screen.getByText("All done")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open App D" }));
    expect(onOpenWorkspace).toHaveBeenCalledWith(workspaces[1]);
  });

  it("lists the late task and opens it on its own board", () => {
    const { onOpenTask } = renderPortfolio();
    fireEvent.click(screen.getByText("Pose cuisine"));
    expect(onOpenTask).toHaveBeenCalledWith("b-c", "Pose cuisine");
    expect(screen.getByText("Overdue")).toBeTruthy();
  });

  it("draws a timeline row per dated workspace", () => {
    renderPortfolio();
    expect(screen.getByText("Timelines")).toBeTruthy();
    expect(screen.getByText("29 d")).toBeTruthy();
  });

  it("shows nothing but a notice to someone who is not on the Team", () => {
    renderPortfolio({ isTeam: false });
    expect(screen.getByText("Portfolio overview is for Team members")).toBeTruthy();
    expect(hookState.boardsAsked.at(-1)).toEqual([]);
    expect(screen.queryByText("App C")).toBeNull();
  });

  it("offers a retry when loading fails", () => {
    const retry = vi.fn();
    hookState.value = { items: [], loading: false, error: new Error("offline"), retry };
    renderPortfolio();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
  });

  it("says so when there are no shared workspaces", () => {
    renderPortfolio({ workspaces: [workspaces[2]], boards: [boards[3]] });
    expect(screen.getByText("No shared workspaces yet")).toBeTruthy();
  });
});
