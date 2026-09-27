import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchSettled, isWriteRequest, resetPendingWrites, trackWrites, writesSettled } from "@/lib/pendingWrites";

const base = "https://x.supabase.co";

describe("isWriteRequest", () => {
  it("counts inserts, updates and deletes on tables", () => {
    expect(isWriteRequest(`${base}/rest/v1/items`, "POST")).toBe(true);
    expect(isWriteRequest(`${base}/rest/v1/items?id=eq.1`, "PATCH")).toBe(true);
    expect(isWriteRequest(`${base}/rest/v1/items?id=eq.1`, "DELETE")).toBe(true);
  });
  it("counts the functions that change tasks, and no other function", () => {
    expect(isWriteRequest(`${base}/rest/v1/rpc/merge_item_values`, "POST")).toBe(true);
    expect(isWriteRequest(`${base}/rest/v1/rpc/automations_for_board`, "POST")).toBe(false);
  });
  it("ignores reads, sign-in and file uploads", () => {
    expect(isWriteRequest(`${base}/rest/v1/items?select=*`, "GET")).toBe(false);
    expect(isWriteRequest(`${base}/rest/v1/items`, "HEAD")).toBe(false);
    expect(isWriteRequest(`${base}/auth/v1/token`, "POST")).toBe(false);
    expect(isWriteRequest(`${base}/storage/v1/object/a`, "POST")).toBe(false);
  });
});

describe("fetchSettled", () => {
  beforeEach(() => resetPendingWrites());

  function deferredFetch() {
    let finish!: () => void;
    const baseFetch = vi.fn(
      () => new Promise<Response>((resolve) => (finish = () => resolve(new Response("{}"))))
    );
    return { fetch: trackWrites(baseFetch as unknown as typeof fetch), finish: () => finish() };
  }

  it("waits for a save in flight before reading", async () => {
    const save = deferredFetch();
    const saving = save.fetch(`${base}/rest/v1/rpc/merge_item_values`, { method: "POST" });
    const read = vi.fn(async () => "fresh");
    const result = fetchSettled(read);
    await Promise.resolve();
    expect(read).not.toHaveBeenCalled();
    save.finish();
    await saving;
    expect(await result).toBe("fresh");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again when a save started while it was reading", async () => {
    const save = deferredFetch();
    let calls = 0;
    const read = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        // An edit made while the first read is on its way.
        const saving = save.fetch(`${base}/rest/v1/items?id=eq.1`, { method: "PATCH" });
        setTimeout(() => save.finish(), 0);
        await saving;
      }
      return `read ${calls}`;
    });
    expect(await fetchSettled(read)).toBe("read 2");
  });

  it("gives up waiting after the limit", async () => {
    vi.useFakeTimers();
    const save = deferredFetch();
    void save.fetch(`${base}/rest/v1/items`, { method: "POST" });
    let done = false;
    void writesSettled(3000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});
