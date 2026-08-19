import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkspaceMembersModal from "@/components/WorkspaceMembersModal";
import type { Workspace } from "@/types";

// Two people: one staff, one external. can_access_workspace requires staff for
// any non-private workspace, so on a shared workspace only the staff member can
// actually open it.
const DIRECTORY = [
  { id: "u-staff", full_name: "Amine ABOUTALIB", avatar_initials: "AA", color: "#f59e0b", is_staff: true },
  { id: "u-ext", full_name: "E2E Test User", avatar_initials: "E2", color: "#3b82f6", is_staff: false },
];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "user_directory") {
        return { select: () => ({ order: () => Promise.resolve({ data: DIRECTORY, error: null }) }) };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    }),
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const sharedWorkspace = {
  id: "ws-1",
  name: "Test",
  is_private: false,
  created_by: "u-staff",
} as unknown as Workspace;

describe("WorkspaceMembersModal — who really has access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not claim an external person can open a shared workspace", async () => {
    // The badge used to read "Has access" for every row on a shared workspace,
    // which contradicted the database: an external user is refused by
    // can_access_workspace and sees nothing.
    render(
      <WorkspaceMembersModal workspace={sharedWorkspace} currentUserId="u-staff" onClose={vi.fn()} />,
      { wrapper }
    );

    await waitFor(() => expect(screen.getByText("E2E Test User")).toBeInTheDocument());

    expect(screen.getByText(/no access/i)).toBeInTheDocument();
    // exactly one person here is staff, so exactly one row may claim access
    expect(screen.getAllByText(/has access/i)).toHaveLength(1);
  });

  it("tells the reader why, and how to give an external person access", async () => {
    render(
      <WorkspaceMembersModal workspace={sharedWorkspace} currentUserId="u-staff" onClose={vi.fn()} />,
      { wrapper }
    );
    await waitFor(() => expect(screen.getByText("E2E Test User")).toBeInTheDocument());
    expect(screen.getByText(/shared workspaces are staff-only/i)).toBeInTheDocument();
  });
});
