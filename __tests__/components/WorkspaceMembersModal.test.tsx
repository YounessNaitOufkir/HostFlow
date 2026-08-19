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

describe("WorkspaceMembersModal - who is listed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leaves external people out of a shared workspace entirely", async () => {
    // An external can never reach a shared workspace, so listing them - even as
    // denied - is noise in a team workspace's people list.
    render(
      <WorkspaceMembersModal workspace={sharedWorkspace} currentUserId="u-staff" onClose={vi.fn()} />,
      { wrapper }
    );

    await waitFor(() => expect(screen.getByText("Amine ABOUTALIB")).toBeInTheDocument());
    expect(screen.queryByText("E2E Test User")).not.toBeInTheDocument();
    expect(screen.getAllByText(/has access/i)).toHaveLength(1);
  });

  it("still lists external people on a private workspace, so they can be invited", async () => {
    // A private workspace is how you would give one external person access to
    // something specific, so they have to remain invitable there.
    const privateWorkspace = { ...sharedWorkspace, is_private: true } as typeof sharedWorkspace;
    render(
      <WorkspaceMembersModal workspace={privateWorkspace} currentUserId="u-staff" onClose={vi.fn()} />,
      { wrapper }
    );

    await waitFor(() => expect(screen.getByText("Amine ABOUTALIB")).toBeInTheDocument());
    expect(screen.getByText("E2E Test User")).toBeInTheDocument();
  });

  it("explains that externals are not listed rather than leaving a silent gap", async () => {
    render(
      <WorkspaceMembersModal workspace={sharedWorkspace} currentUserId="u-staff" onClose={vi.fn()} />,
      { wrapper }
    );
    await waitFor(() => expect(screen.getByText("Amine ABOUTALIB")).toBeInTheDocument());
    expect(screen.getByText(/external[\s\S]*not listed/i)).toBeInTheDocument();
  });
});
