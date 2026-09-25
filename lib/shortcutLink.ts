/**
 * Right-click shortcuts on the installed app's taskbar/dock icon (see
 * app/manifest.ts's `shortcuts`). Each one launches `/?view=<id>`, and this
 * reads that once on the first load of a session — mirrors lib/deepLink.ts,
 * which does the same for a board/item link.
 */

export const SHORTCUT_VIEW_PARAM = "view";

export const SHORTCUT_VIEWS = ["my_work", "portfolio_overview", "workspace_gantt", "notifications"] as const;
export type ShortcutView = (typeof SHORTCUT_VIEWS)[number];

function isShortcutView(value: string | null): value is ShortcutView {
  return !!value && (SHORTCUT_VIEWS as readonly string[]).includes(value);
}

/** The shortcut view in the current URL, if there is a valid one. */
export function readShortcutView(): ShortcutView | null {
  if (typeof window === "undefined") return null;
  try {
    const value = new URLSearchParams(window.location.search).get(SHORTCUT_VIEW_PARAM);
    return isShortcutView(value) ? value : null;
  } catch {
    return null;
  }
}

/** Takes `?view=` back out of the address bar once it has been acted on. */
export function clearShortcutView(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SHORTCUT_VIEW_PARAM)) return;
    url.searchParams.delete(SHORTCUT_VIEW_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // A browser that refuses replaceState is not a reason to lose the navigation.
  }
}
