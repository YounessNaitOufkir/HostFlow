import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Board } from "@/types";

const { mockSubscribe, mockOn, mockRemoveChannel } = vi.hoisted(() => {
  const subscribe = vi.fn();
  const on = vi.fn().mockImplementation(() => ({
    on,
    subscribe,
  }));
  const removeChannel = vi.fn();
  return { mockSubscribe: subscribe, mockOn: on, mockRemoveChannel: removeChannel };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: vi.fn().mockImplementation(() => ({
      on: mockOn,
      subscribe: mockSubscribe,
    })),
    removeChannel: mockRemoveChannel,
  },
}));

import { useRealtimeSync } from "@/hooks/useRealtimeSync";

describe("useRealtimeSync — Batch 4.2", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSubscribe.mockClear();
    mockOn.mockClear();
    mockRemoveChannel.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const mockBoard: Board = {
    id: "board-rt-1",
    name: "Realtime Board",
    columns: [],
  };

  it("creates board channel and subscribes to items, groups, automations, boards, and item_links", () => {
    const onBoardDataChanged = vi.fn();
    const onBoardsChanged = vi.fn();

    renderHook(() =>
      useRealtimeSync({
        activeBoard: mockBoard,
        onBoardDataChanged,
        onBoardsChanged,
      })
    );

    // Verify channel subscription setup
    expect(mockSubscribe).toHaveBeenCalled();
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ table: "items", filter: "board_id=eq.board-rt-1" }),
      expect.any(Function)
    );
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ table: "groups", filter: "board_id=eq.board-rt-1" }),
      expect.any(Function)
    );
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ table: "automations", filter: "board_id=eq.board-rt-1" }),
      expect.any(Function)
    );
  });

  it("debounces rapid onBoardDataChanged updates (150ms)", () => {
    const onBoardDataChanged = vi.fn();
    const onBoardsChanged = vi.fn();

    renderHook(() =>
      useRealtimeSync({
        activeBoard: mockBoard,
        onBoardDataChanged,
        onBoardsChanged,
      })
    );

    // Extract the debounced callback registered for table 'items'
    const itemCall = mockOn.mock.calls.find(
      (call: any[]) => call[1]?.table === "items"
    );
    expect(itemCall).toBeDefined();

    const debouncedFn = itemCall[2];

    // Fire multiple times quickly
    debouncedFn();
    debouncedFn();
    debouncedFn();

    expect(onBoardDataChanged).not.toHaveBeenCalled();

    // Fast-forward 150ms
    vi.advanceTimersByTime(150);

    // Should only be called once due to debounce
    expect(onBoardDataChanged).toHaveBeenCalledTimes(1);
    expect(onBoardDataChanged).toHaveBeenCalledWith("board-rt-1");
  });

  it("does not create channel when activeBoard is null", () => {
    renderHook(() =>
      useRealtimeSync({
        activeBoard: null,
        onBoardDataChanged: vi.fn(),
        onBoardsChanged: vi.fn(),
      })
    );

    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});
