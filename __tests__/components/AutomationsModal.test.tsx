import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AutomationsModal from "@/components/AutomationsModal";
import type { Board, Group, Item, Automation, Profile } from "@/types";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

describe("AutomationsModal & Recipe Gallery — Batch 3", () => {
  const mockBoard: Board = {
    id: "board-auto-1",
    name: "Automations Test Board",
    description: "",
    columns: [
      { id: "col-status", title: "Status", type: "status" },
      { id: "col-date", title: "Due Date", type: "date" },
    ],
  };

  const mockGroups: Group[] = [
    {
      id: "group-1",
      board_id: "board-auto-1",
      title: "In Progress",
      color: "#579bfc",
      position: 0,
    },
    {
      id: "group-completed",
      board_id: "board-auto-1",
      title: "Completed",
      color: "#00c875",
      position: 1,
    },
  ];

  const mockProfiles: Profile[] = [
    {
      id: "user-admin",
      email: "younessnaitoufkir@gmail.com",
      full_name: "Youness Admin",
      role: "admin", avatar_initials: "AD", color: "bg-red-500" },
  ];

  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  it("renders automations modal header and empty automation list message", async () => {
    render(
      <AutomationsModal
        board={mockBoard}
        groups={mockGroups}
        items={[]}
        boardAutomations={[]}
        profiles={mockProfiles}
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Automation Center")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(/no automations active on this board/i)
      ).toBeInTheDocument();
    });
  });

  it("reveals all 5 recipes when '+ Add New Automation' is clicked", () => {
    render(
      <AutomationsModal
        board={mockBoard}
        groups={mockGroups}
        items={[]}
        boardAutomations={[]}
        profiles={mockProfiles}
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    const addBtn = screen.getByText(/add new automation/i);
    fireEvent.click(addBtn);

    // Assert all 5 recipe titles are present
    expect(screen.getByText("Auto-Archive / Completion")).toBeInTheDocument();
    expect(screen.getByText("Due Date Warning (SLA Alert)")).toBeInTheDocument();
    expect(screen.getByText("Automatic Overdue Tagging")).toBeInTheDocument();
    expect(screen.getByText("Cancelled Item Cleanup")).toBeInTheDocument();
    expect(screen.getByText("Timeline & Date Shifting")).toBeInTheDocument();
  });

  it("renders Active Rules section without manual SLA banner", () => {
    render(
      <AutomationsModal
        board={mockBoard}
        groups={mockGroups}
        items={[]}
        boardAutomations={[]}
        profiles={mockProfiles}
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Active Rules")).toBeInTheDocument();
    expect(screen.queryByText("Run SLA Check Now")).not.toBeInTheDocument();
  });
});

