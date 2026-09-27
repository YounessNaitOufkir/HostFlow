import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NotificationsMenu from "@/components/NotificationsMenu";

const NOTIFICATIONS = [
  {
    id: "n1",
    user_id: "admin-1",
    message: "Karim Benali is asking to join the Host'lik team.",
    message_key: "notif.workspaceAccessRequest",
    message_vars: { name: "Karim Benali", note: "New site manager", requestId: "r1" },
    related_user_id: "u-karim",
    read: false,
    created_at: "2026-09-27T09:00:00Z",
  },
  {
    id: "n2",
    user_id: "admin-1",
    message: "Sara Alami is asking to join the Host'lik team.",
    message_key: "notif.workspaceAccessRequest",
    message_vars: { name: "Sara Alami", requestId: "r2" },
    related_user_id: "u-sara",
    read: true,
    created_at: "2026-09-26T09:00:00Z",
  },
];

const REQUESTS = [
  { id: "r1", user_id: "u-karim", note: "New site manager", status: "pending", reason: null, decided_by: null, decided_at: null, cleared_at: null, created_at: "2026-09-27T09:00:00Z" },
  { id: "r2", user_id: "u-sara", note: null, status: "declined", reason: null, decided_by: "admin-2", decided_at: "2026-09-27T08:00:00Z", cleared_at: null, created_at: "2026-09-26T09:00:00Z" },
];

const PEOPLE = [
  { id: "u-karim", full_name: "Karim Benali" },
  { id: "u-sara", full_name: "Sara Alami" },
  { id: "admin-2", full_name: "Amine" },
];

const { rpc, toastInfo } = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("@/lib/supabase", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "notifications") {
          return {
            select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: NOTIFICATIONS, error: null }) }) }) }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          };
        }
        if (table === "access_requests") {
          return { select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: REQUESTS, error: null }) }) }) };
        }
        return { select: () => ({ in: () => Promise.resolve({ data: PEOPLE, error: null }) }) };
      },
      rpc,
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ profile: { id: "admin-1", role: "admin" }, refreshProfile: vi.fn() }),
}));

vi.mock("@/lib/errorReporting", () => ({
  runWrite: () => Promise.resolve(true),
  reportMutationError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { info: toastInfo, success: vi.fn(), error: vi.fn() } }));

function renderMenu(onNotificationClick = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationsMenu userId="admin-1" onNotificationClick={onNotificationClick} />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
  return onNotificationClick;
}

describe("Answering an access request from the bell", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
    toastInfo.mockReset();
  });

  it("shows the note, with Approve and Decline on a request still waiting", async () => {
    renderMenu();
    await screen.findByRole("button", { name: "Approve Karim Benali's request" });
    expect(screen.getByText("“New site manager”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline Karim Benali's request" })).toBeInTheDocument();
  });

  it("shows who decided instead of the buttons once a request is answered", async () => {
    renderMenu();
    expect(await screen.findByText(/Declined by Amine/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve Sara Alami's request" })).not.toBeInTheDocument();
  });

  it("approves, then opens Data Access for the person so their workspaces can be chosen", async () => {
    const onClick = renderMenu();
    fireEvent.click(await screen.findByRole("button", { name: "Approve Karim Benali's request" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("decide_access_request", { request_id: "r1", approve: true, reason: null })
    );
    await waitFor(() => expect(onClick).toHaveBeenCalledWith(undefined, undefined, "u-karim", undefined));
  });

  it("declines with the standard reason stored empty, the menu staying open behind the dialog", async () => {
    renderMenu();
    fireEvent.click(await screen.findByRole("button", { name: "Decline Karim Benali's request" }));

    const dialog = screen.getByRole("dialog", { name: "Decline Karim Benali's request?" });
    const reason = within(dialog).getByLabelText("Reason") as HTMLTextAreaElement;
    expect(reason.value).toBe("You're not a member of the Host'lik team.");

    // A click in the dialog is not a click outside the menu.
    fireEvent.mouseDown(reason);
    expect(screen.getByText("“New site manager”")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Decline request" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("decide_access_request", { request_id: "r1", approve: false, reason: null })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends the admin's own reason when they write one", async () => {
    renderMenu();
    fireEvent.click(await screen.findByRole("button", { name: "Decline Karim Benali's request" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Staff only for now." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Decline request" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("decide_access_request", {
        request_id: "r1",
        approve: false,
        reason: "Staff only for now.",
      })
    );
  });

  it("Escape closes the dialog without deciding", async () => {
    renderMenu();
    fireEvent.click(await screen.findByRole("button", { name: "Decline Karim Benali's request" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says so when another admin answered first, and does not open Data Access", async () => {
    rpc.mockResolvedValue({ error: { message: "Already decided." } });
    const onClick = renderMenu();
    fireEvent.click(await screen.findByRole("button", { name: "Approve Karim Benali's request" }));
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith("Another admin already answered this request."));
    expect(onClick).not.toHaveBeenCalled();
  });
});
