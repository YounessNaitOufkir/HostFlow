import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import WorkspaceGanttView from "@/components/WorkspaceGanttView";
import type { Board, Workspace } from "@/types";

vi.mock("@/hooks/useWorkspaceGanttData", () => ({
  useWorkspaceGanttData: () => ({ loading: false, items: [], groups: [], itemLinks: [] }),
}));
vi.mock("@/components/GanttView", () => ({ default: () => <div>gantt</div> }));

// The real account has three different properties each with a board called
// "Lancement". Flat, the panel lists them identically and you cannot tell which
// checkbox belongs to which property.
const workspaces = [
  { id: "ws-a", name: "Studio A", is_private: false },
  { id: "ws-b", name: "App C", is_private: true },
  { id: "ws-c", name: "General tasks", is_private: false },
] as unknown as Workspace[];

const boards = [
  { id: "b1", name: "Lancement", workspace_id: "ws-a", columns: [] },
  { id: "b2", name: "Lancement", workspace_id: "ws-b", columns: [] },
  { id: "b3", name: "Communication", workspace_id: "ws-b", columns: [] },
  { id: "b4", name: "Lancement", workspace_id: "ws-c", columns: [] },
] as unknown as Board[];

describe("WorkspaceGanttView — which workspace each board comes from", () => {
  it("groups the boards under their workspace", () => {
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);

    expect(screen.getByText("Studio A")).toBeInTheDocument();
    expect(screen.getByText("App C")).toBeInTheDocument();
    expect(screen.getByText("General tasks")).toBeInTheDocument();
    // the three identically-named boards are still all listed
    expect(screen.getAllByText("Lancement")).toHaveLength(3);
  });

  it("puts each duplicate name under a different workspace", () => {
    const { container } = render(
      <WorkspaceGanttView allBoards={boards} workspaces={workspaces} />
    );
    // App C owns two boards; its group must contain both, and exactly one
    // "Lancement" — not all three.
    const appC = screen.getByText("App C").closest("div")?.parentElement as HTMLElement;
    expect(within(appC).getAllByText("Lancement")).toHaveLength(1);
    expect(within(appC).getByText("Communication")).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it("marks a private workspace so it is not mistaken for a shared one", () => {
    const { container } = render(
      <WorkspaceGanttView allBoards={boards} workspaces={workspaces} />
    );
    expect(container.querySelectorAll("svg.lucide-lock").length).toBe(1);
  });
});
