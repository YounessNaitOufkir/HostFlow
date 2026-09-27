import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Handler = (payload: Record<string, unknown>) => void;

const rt = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  statusCallbacks: [] as ((status: string) => void)[],
  removed: 0,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => {
      const channel = {
        on: (_type: string, filter: { table: string }, handler: Handler) => {
          rt.handlers.set(filter.table, handler);
          return channel;
        },
        subscribe: (cb: (status: string) => void) => {
          rt.statusCallbacks.push(cb);
          return channel;
        },
      };
      return channel;
    }),
    removeChannel: vi.fn(() => {
      rt.removed++;
    }),
  },
}));

import { useLiveSync, COMMENTS_CHANGED_EVENT, RESYNC_EVENT } from "@/hooks/useLiveSync";
import type { Profile } from "@/types";

const status = (s: string) => act(() => rt.statusCallbacks.at(-1)!(s));
const emit = (table: string, eventType: string, row: Record<string, unknown>) =>
  act(() => {
    rt.handlers.get(table)!({
      eventType,
      new: eventType === "DELETE" ? {} : row,
      old: eventType === "DELETE" ? row : { id: row.id },
    });
  });

function setup(profile: Pick<Profile, "role" | "is_staff"> = { role: "member", is_staff: true }) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const refreshProfile = vi.fn(async () => {});
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useLiveSync({ userId: "me", profile, refreshProfile }), { wrapper });
  const invalidated = () => invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey ?? "ALL"));
  return { client, invalidate, invalidated, refreshProfile, hook };
}

describe("useLiveSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rt.handlers.clear();
    rt.statusCallbacks.length = 0;
    rt.removed = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes My Work when a task is assigned to you, with no board open", async () => {
    const { invalidated } = setup();
    status("SUBSCRIBED");
    emit("items", "UPDATE", { id: "t1", board_id: "b1", column_values: { people: ["me"] } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(invalidated()).toContain(JSON.stringify(["myWorkItems"]));
  });

  it("refreshes My Work when a task you had is unassigned, but not for others' tasks", async () => {
    const { client, invalidated } = setup();
    client.setQueryData(["myWorkItems", "me", "b1"], [{ id: "mine" }]);
    status("SUBSCRIBED");
    emit("items", "UPDATE", { id: "other", board_id: "b1", column_values: { people: ["you"] } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(invalidated()).not.toContain(JSON.stringify(["myWorkItems"]));
    emit("items", "UPDATE", { id: "mine", board_id: "b1", column_values: { people: [] } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(invalidated()).toContain(JSON.stringify(["myWorkItems"]));
  });

  it("refreshes the board a task moved away from", async () => {
    const { client, invalidated } = setup();
    client.setQueryData(["boardData", "old"], { items: [{ id: "t1" }], trashItems: [] });
    emit("items", "UPDATE", { id: "t1", board_id: "new", column_values: {} });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(invalidated()).toEqual(
      expect.arrayContaining([JSON.stringify(["boardData", "new"]), JSON.stringify(["boardData", "old"])])
    );
  });

  it("turns a burst of changes into one refresh per screen", async () => {
    const { invalidate } = setup();
    for (let i = 0; i < 50; i++) emit("groups", "UPDATE", { id: `g${i}`, board_id: "b1" });
    await act(() => vi.advanceTimersByTimeAsync(300));
    const boardRefreshes = invalidate.mock.calls.filter(
      (c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(["boardData", "b1"])
    );
    expect(boardRefreshes).toHaveLength(1);
  });

  it("tells the task rows which task's comments changed", async () => {
    setup();
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail.itemId);
    window.addEventListener(COMMENTS_CHANGED_EVENT, listener);
    emit("updates", "INSERT", { id: "c1", item_id: "t1" });
    await act(() => vi.advanceTimersByTimeAsync(300));
    window.removeEventListener(COMMENTS_CHANGED_EVENT, listener);
    expect(seen).toEqual(["t1"]);
  });

  it("reloads your profile, and what you can see, when an admin changes your role", async () => {
    const { invalidated, refreshProfile } = setup({ role: "member", is_staff: false });
    emit("profiles", "UPDATE", { id: "me", role: "member", is_staff: true });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(refreshProfile).toHaveBeenCalled();
    expect(invalidated()).toContain(JSON.stringify(["workspaces"]));
  });

  it("shows Reconnecting after a few seconds down, and catches up once back", async () => {
    const { hook, invalidate, refreshProfile } = setup();
    let resyncs = 0;
    const onResync = () => resyncs++;
    window.addEventListener(RESYNC_EVENT, onResync);

    status("SUBSCRIBED");
    status("CHANNEL_ERROR");
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(hook.result.current.reconnecting).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(hook.result.current.reconnecting).toBe(true);

    invalidate.mockClear();
    status("SUBSCRIBED");
    expect(hook.result.current.reconnecting).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(600));
    // Everything on screen refetches: invalidateQueries with no filter.
    expect(invalidate).toHaveBeenCalledWith();
    expect(refreshProfile).toHaveBeenCalled();
    expect(resyncs).toBe(1);
    window.removeEventListener(RESYNC_EVENT, onResync);
  });

  it("does not catch up on the first connection", async () => {
    const { invalidate } = setup();
    status("SUBSCRIBED");
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(invalidate).not.toHaveBeenCalledWith();
  });

  it("rebuilds a connection that has not come back by itself", async () => {
    setup();
    status("SUBSCRIBED");
    status("TIMED_OUT");
    expect(rt.statusCallbacks).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(15000));
    expect(rt.removed).toBe(1);
    expect(rt.statusCallbacks).toHaveLength(2);
  });

  it("catches up when a tab comes back after a long time hidden", async () => {
    const { invalidate } = setup();
    status("SUBSCRIBED");
    const hidden = vi.spyOn(document, "hidden", "get");
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(() => vi.advanceTimersByTimeAsync(61000));
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(invalidate).toHaveBeenCalledWith();
    hidden.mockRestore();
  });
});

describe("useLiveSync first connection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rt.statusCallbacks.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("shows Reconnecting when the first connection never comes up", async () => {
    const { hook } = setup();
    await act(() => vi.advanceTimersByTimeAsync(4500));
    expect(hook.result.current.reconnecting).toBe(true);
  });

  it("shows nothing when the first connection comes up in time", async () => {
    const { hook } = setup();
    await act(() => vi.advanceTimersByTimeAsync(800));
    status("SUBSCRIBED");
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(hook.result.current.reconnecting).toBe(false);
  });
});
