import { describe, it, expect } from "vitest";
import { isBoardIndependentView, BOARD_INDEPENDENT_VIEWS,
  viewAfterLeaving,
} from "@/lib/navState";

// Every view app/page.tsx can put in mainView, split by whether it needs an
// active board behind it. Restoring a board-scoped view with no board renders
// an indefinite "Loading board..." spinner, and the persist effect writes that
// pairing straight back, so the user is stuck on it across reloads.
const BOARD_SCOPED = ["board", "kanban", "dashboard", "calendar", "gantt", "cards"];
const STANDALONE = ["my_work", "trash", "workspace_overview", "workspace_gantt"];

describe("isBoardIndependentView", () => {
  it.each(STANDALONE)("restores %s without a board", (view) => {
    expect(isBoardIndependentView(view)).toBe(true);
  });

  it.each(BOARD_SCOPED)("refuses to restore %s without a board", (view) => {
    expect(isBoardIndependentView(view)).toBe(false);
  });

  it("treats an unknown view as board-scoped", () => {
    // A view added later is board-scoped more often than not, and the safe
    // wrong answer is My Work rather than a spinner with no way out.
    expect(isBoardIndependentView("some_future_view")).toBe(false);
  });

  it("handles a missing view", () => {
    expect(isBoardIndependentView(null)).toBe(false);
    expect(isBoardIndependentView(undefined)).toBe(false);
    expect(isBoardIndependentView("")).toBe(false);
  });

  it("keeps the two lists disjoint", () => {
    expect(BOARD_SCOPED.filter((v) => BOARD_INDEPENDENT_VIEWS.has(v))).toEqual([]);
  });
});

describe("viewAfterLeaving", () => {
  it("returns to the board when one is open", () => {
    expect(viewAfterLeaving(true)).toBe("board");
  });

  it("goes to the workspace overview when no board is open", () => {
    // Returning to "board" with nothing to render leaves an indefinite
    // "Loading board..." spinner the user can only escape via the sidebar.
    // This shipped twice: once for My Work, then again for Trash.
    expect(viewAfterLeaving(false)).toBe("workspace_overview");
  });

  it("never returns a board-scoped view without a board", () => {
    expect(isBoardIndependentView(viewAfterLeaving(false))).toBe(true);
  });
});
