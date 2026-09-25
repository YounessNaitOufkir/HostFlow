import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requestOpenNotifications,
  consumePendingOpenNotifications,
  onOpenNotificationsRequested,
} from "@/lib/notificationsOpenSignal";

describe("notificationsOpenSignal", () => {
  beforeEach(() => {
    // Drain any flag a previous test left latched.
    consumePendingOpenNotifications();
  });

  it("latches the request so a not-yet-mounted menu can still see it", () => {
    requestOpenNotifications();
    expect(consumePendingOpenNotifications()).toBe(true);
  });

  it("is consumed at most once", () => {
    requestOpenNotifications();
    expect(consumePendingOpenNotifications()).toBe(true);
    expect(consumePendingOpenNotifications()).toBe(false);
  });

  it("is false when nothing was requested", () => {
    expect(consumePendingOpenNotifications()).toBe(false);
  });

  it("notifies an already-mounted listener live", () => {
    const handler = vi.fn();
    const unsubscribe = onOpenNotificationsRequested(handler);
    requestOpenNotifications();
    expect(handler).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("stops notifying after unsubscribing", () => {
    const handler = vi.fn();
    const unsubscribe = onOpenNotificationsRequested(handler);
    unsubscribe();
    requestOpenNotifications();
    expect(handler).not.toHaveBeenCalled();
  });
});
