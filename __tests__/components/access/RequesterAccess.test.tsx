import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HostlikAccessPrompt } from "@/components/access/HostlikAccessPrompt";
import { AccessDeclinedPopup } from "@/components/access/AccessDeclinedPopup";
import type { AccessRequest } from "@/lib/accessRequests";
import type { Profile } from "@/types";

const { state, rpc } = vi.hoisted(() => ({
  state: { requests: [] as unknown[] },
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: () => ({
        select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: state.requests, error: null }) }) }),
      }),
      rpc,
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ profile: null, refreshProfile: vi.fn() }),
}));

vi.mock("@/lib/errorReporting", () => ({ reportMutationError: vi.fn() }));

const karim = { id: "u-karim", full_name: "Karim Benali", role: "member", is_staff: false } as Profile;

const req = (over: Partial<AccessRequest>): AccessRequest => ({
  id: "r1",
  user_id: "u-karim",
  note: null,
  status: "pending",
  reason: null,
  decided_by: "admin-1",
  decided_at: "2026-09-27T09:00:00Z",
  cleared_at: null,
  created_at: "2026-09-26T09:00:00Z",
  ...over,
});

function renderWith(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("The Host'lik prompt, for the person asking", () => {
  beforeEach(() => {
    state.requests = [];
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
  });

  it("asks with an optional note, then says it is waiting", async () => {
    renderWith(<HostlikAccessPrompt profile={karim} variant="sidebar" />);
    fireEvent.click(await screen.findByRole("button", { name: "request access to Host'lik" }));
    fireEvent.change(screen.getByLabelText("A note for the admin (optional)"), {
      target: { value: "  New site manager  " },
    });
    // The refetch after sending finds the new request.
    state.requests = [req({ status: "pending", decided_by: null, decided_at: null })];
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("request_workspace_access", { note: "New site manager" })
    );
    expect(await screen.findByText(/Request sent/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for an admin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "request access to Host'lik" })).not.toBeInTheDocument();
  });

  it("sends no note when none was written", async () => {
    renderWith(<HostlikAccessPrompt profile={karim} variant="page" />);
    fireEvent.click(await screen.findByRole("button", { name: "request access to Host'lik" }));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("request_workspace_access", { note: null }));
  });

  it("keeps the note and says so when sending fails", async () => {
    rpc.mockResolvedValue({ error: { message: "network down" } });
    renderWith(<HostlikAccessPrompt profile={karim} variant="sidebar" />);
    fireEvent.click(await screen.findByRole("button", { name: "request access to Host'lik" }));
    fireEvent.change(screen.getByLabelText("A note for the admin (optional)"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send your request");
    expect(screen.getByLabelText("A note for the admin (optional)")).toHaveValue("Hello");
  });

  it("shows a waiting request after a reload instead of offering to ask again", async () => {
    state.requests = [req({ status: "pending", decided_by: null, decided_at: null })];
    renderWith(<HostlikAccessPrompt profile={karim} variant="sidebar" />);
    expect(await screen.findByText(/Request sent/)).toBeInTheDocument();
  });

  it("shows a decline for good, with no way to ask again", async () => {
    state.requests = [req({ status: "declined" })];
    renderWith(<HostlikAccessPrompt profile={karim} variant="sidebar" />);
    expect(await screen.findByText(/Access request declined on/)).toBeInTheDocument();
    expect(screen.getByText(/Contact your manager at Host'lik/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("tells a Team member without workspaces that an admin is choosing them", async () => {
    state.requests = [req({ status: "approved" })];
    renderWith(<HostlikAccessPrompt profile={{ ...karim, is_staff: true }} variant="sidebar" />);
    expect(await screen.findByText("You're on the Host'lik team.")).toBeInTheDocument();
  });

  it("renders nothing, wrapper included, for an admin", async () => {
    const { container } = renderWith(
      <HostlikAccessPrompt profile={{ ...karim, role: "admin", is_staff: true }} variant="sidebar" className="border-t" />
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("The declined popup", () => {
  beforeEach(() => {
    localStorage.clear();
    state.requests = [];
  });

  it("tells the reason once, then not again", async () => {
    state.requests = [req({ status: "declined" })];
    const first = renderWith(<AccessDeclinedPopup profile={karim} />);
    const dialog = await screen.findByRole("alertdialog", { name: "Your access request was declined" });
    expect(dialog).toHaveTextContent("“You're not a member of the Host'lik team.”");
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    first.unmount();

    renderWith(<AccessDeclinedPopup profile={karim} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("gives the admin's own reason when there is one", async () => {
    state.requests = [req({ status: "declined", reason: "Staff only for now." })];
    renderWith(<AccessDeclinedPopup profile={karim} />);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("“Staff only for now.”");
  });

  it("does not show for a waiting request, or once the person is on the team", async () => {
    state.requests = [req({ status: "pending" })];
    const waiting = renderWith(<AccessDeclinedPopup profile={karim} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    waiting.unmount();

    state.requests = [req({ status: "declined", cleared_at: "2026-09-28T00:00:00Z" })];
    renderWith(<AccessDeclinedPopup profile={{ ...karim, is_staff: true }} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
