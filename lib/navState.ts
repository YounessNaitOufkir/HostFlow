/**
 * Where the user was when they last left, so logging back in continues their
 * work instead of dropping them somewhere arbitrary.
 *
 * Stored as one record rather than the three loose keys this replaced
 * (monday_clone_main_view / _active_board_id / _active_workspace_id), because
 * those were per-BROWSER with no notion of who wrote them. Signing in as a
 * different account inherited the previous account's view and workspace — very
 * visible when switching between a real account and a test one on one machine.
 *
 * The stored userId makes that impossible: state written by one account is
 * ignored by another.
 */

const KEY = "hostflow_nav_state";

/**
 * Views that stand on their own without an active board.
 *
 * Everything else — "board", "kanban", "dashboard", "calendar", "gantt",
 * "cards" — renders a specific board and shows an indefinite "Loading board..."
 * spinner if it is restored while activeBoard is null.
 *
 * This is a whitelist rather than a list of board views on purpose: a view
 * added later is board-scoped far more often than not, and the safe wrong
 * answer is landing on My Work, not a spinner the user cannot escape without
 * clicking the sidebar.
 */
export const BOARD_INDEPENDENT_VIEWS = new Set([
  "my_work",
  "trash",
  "workspace_overview",
  "workspace_gantt",
  "portfolio_overview",
]);

/** True if this view can be restored without a board behind it. */
export function isBoardIndependentView(view: string | null | undefined): boolean {
  return !!view && BOARD_INDEPENDENT_VIEWS.has(view);
}

/**
 * Where to land when leaving a board-independent view — My Work, Trash — by
 * toggling its sidebar button off.
 *
 * The obvious answer, "go back to the board view", strands the user on an
 * indefinite "Loading board..." spinner whenever no board is open, escapable only
 * by picking a workspace from the panel. That bug was found and fixed for My Work,
 * then shipped again for Trash because the rule lived inline in one button and not
 * the other. Naming it here means the next view to grow a toggle inherits it.
 */
export function viewAfterLeaving(hasActiveBoard: boolean): "board" | "workspace_overview" {
  return hasActiveBoard ? "board" : "workspace_overview";
}

export interface NavState {
  userId: string;
  mainView: string;
  boardId: string | null;
  workspaceId: string | null;
}

/** Returns the saved location, or null if there is none or it belongs to someone else. */
export function readNavState(userId: string | null | undefined): NavState | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NavState>;
    if (!parsed || parsed.userId !== userId) return null;
    return {
      userId,
      mainView: typeof parsed.mainView === "string" ? parsed.mainView : "board",
      boardId: typeof parsed.boardId === "string" ? parsed.boardId : null,
      workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : null,
    };
  } catch {
    return null;
  }
}

export function writeNavState(state: NavState): void {
  if (!state.userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private browsing or a full quota — losing the last position is not worth
    // interrupting anything for.
  }
}

/**
 * Removes the three keys this replaced. Called once on load so a browser that
 * used the old scheme does not keep stale, unowned values around forever.
 */
export function clearLegacyNavKeys(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("monday_clone_main_view");
    window.localStorage.removeItem("monday_clone_active_board_id");
    window.localStorage.removeItem("monday_clone_active_workspace_id");
  } catch {
    // ignore
  }
}
