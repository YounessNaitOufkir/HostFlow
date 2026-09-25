/**
 * Tells NotificationsMenu to open itself, for the "Notifications" taskbar
 * shortcut. A plain window event would race NotificationsMenu's own mount —
 * the shortcut consumes its `?view=` param and fires this before the menu is
 * necessarily mounted — so the request is also latched as a flag any later
 * mount can consume.
 */

let pending = false;
const EVENT = "hostflow:open-notifications";

export function requestOpenNotifications(): void {
  pending = true;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** True at most once per request: the first caller (or the first live event) wins. */
export function consumePendingOpenNotifications(): boolean {
  if (!pending) return false;
  pending = false;
  return true;
}

export function onOpenNotificationsRequested(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = () => {
    if (consumePendingOpenNotifications()) handler();
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
