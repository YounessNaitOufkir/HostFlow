/**
 * Opening one item from outside the app — today, from an automation email.
 *
 * HostFlow is a single page with no router, so where you are lives in React
 * state and localStorage (lib/navState). That leaves nothing to link TO. A
 * notification could say a task was overdue but not take anyone to it.
 *
 * The board and item travel as query parameters instead, and app/page.tsx hands
 * them to navigateToItem — the same path notifications and My Work already use
 * to cross boards. Reading is kept separate from clearing so the caller can wait
 * until the boards have loaded and it can actually act, rather than consuming
 * the link and then finding it has nowhere to go.
 */

export const DEEP_LINK_BOARD_PARAM = "board";
export const DEEP_LINK_ITEM_PARAM = "item";

export interface DeepLink {
  boardId: string;
  /** Absent when a link points at a board rather than one task. */
  itemId: string | null;
}

/** Ids are database uuids; anything else is a hand-edited URL, not a link we wrote. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses a query string. Exported so it can be tested without a browser. */
export function parseDeepLink(search: string): DeepLink | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  const boardId = params.get(DEEP_LINK_BOARD_PARAM);
  if (!boardId || !UUID.test(boardId)) return null;

  const itemId = params.get(DEEP_LINK_ITEM_PARAM);
  return { boardId, itemId: itemId && UUID.test(itemId) ? itemId : null };
}

/** The deep link in the current URL, if there is a well-formed one. */
export function readDeepLink(): DeepLink | null {
  if (typeof window === "undefined") return null;
  return parseDeepLink(window.location.search);
}

/**
 * Takes the parameters back out of the address bar once they have been acted on,
 * so a reload does not drag the user back to the same task after they have
 * navigated away — and so the link is not still sitting there to be shared or
 * bookmarked as if it were this session's location.
 */
export function clearDeepLink(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (
      !url.searchParams.has(DEEP_LINK_BOARD_PARAM) &&
      !url.searchParams.has(DEEP_LINK_ITEM_PARAM)
    ) {
      return;
    }
    url.searchParams.delete(DEEP_LINK_BOARD_PARAM);
    url.searchParams.delete(DEEP_LINK_ITEM_PARAM);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // A browser that refuses replaceState is not a reason to lose the navigation
    // that already happened.
  }
}
