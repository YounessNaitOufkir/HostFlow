import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useAppHistory, type AppLocation } from "@/hooks/useAppHistory";

/**
 * The app has one URL, so Back/Forward only work if each board/view change is
 * pushed as a history entry and popstate restores it. These drive the hook the
 * way page.tsx does: a location in state, and an apply() that sets it.
 */
function useHarness(initial: AppLocation) {
  const [location, setLocation] = useState(initial);
  const history = useAppHistory({ ready: true, location, apply: setLocation });
  return { location, setLocation, history };
}

const board = (id: string, view = "board"): AppLocation => ({ boardId: id, workspaceId: "ws", mainView: view });

describe("useAppHistory", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("records each move and walks back and forward through them", async () => {
    const { result } = renderHook(() => useHarness(board("A")));
    expect(result.current.history.canGoBack).toBe(false);

    act(() => result.current.setLocation(board("B")));
    act(() => result.current.setLocation(board("B", "kanban")));
    expect(result.current.history.canGoBack).toBe(true);
    expect(result.current.history.canGoForward).toBe(false);

    act(() => result.current.history.goBack());
    await waitFor(() => expect(result.current.location).toMatchObject(board("B")));
    act(() => result.current.history.goBack());
    await waitFor(() => expect(result.current.location).toMatchObject(board("A")));
    expect(result.current.history.canGoBack).toBe(false);
    expect(result.current.history.canGoForward).toBe(true);

    act(() => result.current.history.goForward());
    await waitFor(() => expect(result.current.location).toMatchObject(board("B")));
  });

  it("does not record the restore itself as a new move", async () => {
    const { result } = renderHook(() => useHarness(board("A")));
    act(() => result.current.setLocation(board("B")));
    const lengthBefore = window.history.length;

    act(() => result.current.history.goBack());
    await waitFor(() => expect(result.current.location).toMatchObject(board("A")));
    expect(window.history.length).toBe(lengthBefore);
    expect(result.current.history.canGoForward).toBe(true);
  });

  it("a new move after going back discards the old forward entries", async () => {
    const { result } = renderHook(() => useHarness(board("A")));
    act(() => result.current.setLocation(board("B")));
    act(() => result.current.history.goBack());
    await waitFor(() => expect(result.current.location).toMatchObject(board("A")));

    act(() => result.current.setLocation(board("C")));
    expect(result.current.history.canGoForward).toBe(false);
    act(() => result.current.history.goBack());
    await waitFor(() => expect(result.current.location).toMatchObject(board("A")));
  });

  it("ignores a workspace change while a board is open (it follows the board)", () => {
    const { result } = renderHook(() => useHarness(board("A")));
    const lengthBefore = window.history.length;
    act(() => result.current.setLocation({ ...board("A"), workspaceId: "other" }));
    expect(window.history.length).toBe(lengthBefore);
  });
});
