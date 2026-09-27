import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import React, { useCallback, useReducer } from "react";
import { useAppHistory, type AppLocation } from "@/hooks/useAppHistory";
import { boardReducer, initialBoardStoreState } from "@/hooks/store/boardReducer";
import type { Board, Workspace } from "@/types";

/** Waits for jsdom's history traversal, which fires popstate asynchronously. */
const settle = () => new Promise((r) => setTimeout(r, 50));

const ws1 = { id: "w1", name: "Appartement 1", is_private: false } as Workspace;
const board1 = { id: "b1", name: "Rénovation", workspace_id: "w1", columns: [] } as unknown as Board;

/**
 * The page's own moves, on the real reducer: open the Portfolio overview from
 * the sidebar, open a workspace from a card, then go Back.
 */
function Page({ expose }: { expose: (api: Record<string, () => void>) => void }) {
  const [state, dispatch] = useReducer(boardReducer, {
    ...initialBoardStoreState,
    loading: false,
    workspaces: [ws1],
    boards: [board1],
    mainView: "workspace_overview",
  });

  const selectWorkspace = (ws: Workspace | null) => {
    dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: ws });
    dispatch({ type: "SET_ACTIVE_BOARD", payload: null });
    dispatch({ type: "SET_MAIN_VIEW", payload: "workspace_overview" });
  };

  // As app/page.tsx applyHistoryLocation.
  const apply = useCallback(
    (loc: AppLocation) => {
      const board = loc.boardId ? state.boards.find((b) => b.id === loc.boardId) ?? null : null;
      const workspace = loc.workspaceId ? state.workspaces.find((w) => w.id === loc.workspaceId) ?? null : null;
      dispatch({ type: "SET_SELECTED_ITEM", payload: null });
      dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: workspace });
      if (board) dispatch({ type: "SET_ACTIVE_BOARD", payload: board });
      else dispatch({ type: "SET_ACTIVE_BOARD", payload: null });
      dispatch({ type: "SET_MAIN_VIEW", payload: loc.mainView as typeof state.mainView });
    },
    [state.boards, state.workspaces]
  );

  useAppHistory({
    ready: !state.loading,
    location: {
      boardId: state.activeBoard?.id ?? null,
      workspaceId: state.activeWorkspace?.id ?? null,
      mainView: state.mainView,
    },
    apply,
  });

  expose({
    openPortfolio: () => {
      dispatch({ type: "SET_ACTIVE_BOARD", payload: null });
      dispatch({ type: "SET_MAIN_VIEW", payload: "portfolio_overview" });
    },
    openWorkspace: () => selectWorkspace(ws1),
  });
  return <div data-testid="where">{`${state.activeWorkspace?.id ?? "-"}|${state.mainView}`}</div>;
}

describe("Back from a workspace opened on the Portfolio overview", () => {
  it("returns to the Portfolio overview", async () => {
    let api!: Record<string, () => void>;
    const { getByTestId } = render(<Page expose={(a) => (api = a)} />);
    await act(async () => api.openPortfolio());
    await act(async () => api.openWorkspace());
    expect(getByTestId("where").textContent).toBe("w1|workspace_overview");
    await act(async () => {
      window.history.back();
      await settle();
    });
    expect(getByTestId("where").textContent).toBe("-|portfolio_overview");
  });
});
