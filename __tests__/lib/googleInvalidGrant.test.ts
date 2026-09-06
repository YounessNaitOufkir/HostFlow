import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Clearing a stored Google grant is destructive: it signs the user out of the
 * integration and makes them reconnect. It must happen for exactly one error —
 * invalid_grant, which means the token will never work again — and for no other.
 *
 * The bug being guarded is real and was live for weeks. google_connected is
 * `google_refresh_token is not null`, so a token Google had stopped accepting
 * still read as "Connected to Google Calendar" while every sync failed into a
 * console.error nobody sees.
 */

const updates: Record<string, unknown>[] = [];
const eventsInsert = vi.fn();
const eventsUpdate = vi.fn();
const eventsList = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              user_id: "u1",
              google_access_token: "at",
              google_refresh_token: "rt",
            },
          }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} on() {} } },
    calendar: () => ({
      events: { list: eventsList, insert: eventsInsert, update: eventsUpdate },
    }),
  },
  calendar_v3: {},
}));

import { syncTaskToGoogleCalendar } from "@/lib/google-calendar";

const task = { id: "11111111-2222-3333-4444-555555555555", name: "Devis", start: "2026-09-20" };

describe("a Google grant that has stopped working", () => {
  beforeEach(() => {
    updates.length = 0;
    vi.clearAllMocks();
    eventsList.mockResolvedValue({ data: { items: [] } });
  });

  it("clears the dead token so the UI stops claiming a connection", async () => {
    eventsInsert.mockRejectedValue({ response: { data: { error: "invalid_grant" } } });

    const outcome = await syncTaskToGoogleCalendar("u1", task);

    expect(outcome).toEqual({ ok: false, reason: "reauth-required" });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      google_access_token: null,
      google_refresh_token: null,
    });
  });

  it("recognises invalid_grant when it only appears in the message", async () => {
    eventsInsert.mockRejectedValue(new Error("invalid_grant: Bad Request"));
    const outcome = await syncTaskToGoogleCalendar("u1", task);
    expect(outcome).toEqual({ ok: false, reason: "reauth-required" });
  });

  it("does NOT disconnect anyone over a transient failure", async () => {
    // The whole reason the check is narrow. A timeout or a 502 must never cost
    // somebody their integration.
    for (const transient of [
      new Error("ETIMEDOUT"),
      { code: 503, message: "Service Unavailable" },
      { response: { data: { error: "backendError" } } },
      new Error("socket hang up"),
    ]) {
      updates.length = 0;
      eventsInsert.mockRejectedValue(transient);

      const outcome = await syncTaskToGoogleCalendar("u1", task);

      expect(outcome.ok, String(transient)).toBe(false);
      expect(outcome).toMatchObject({ reason: "failed" });
      expect(updates, `disconnected over ${String(transient)}`).toHaveLength(0);
    }
  });

  it("reports success as success, and touches nothing", async () => {
    eventsInsert.mockResolvedValue({ data: { id: "x" } });
    const outcome = await syncTaskToGoogleCalendar("u1", task);
    expect(outcome).toEqual({ ok: true });
    expect(updates).toHaveLength(0);
  });

  it("says so rather than throwing when there is no date to sync", async () => {
    const outcome = await syncTaskToGoogleCalendar("u1", { id: task.id, name: "x" });
    expect(outcome).toEqual({ ok: false, reason: "no-date" });
    expect(eventsInsert).not.toHaveBeenCalled();
  });
});
