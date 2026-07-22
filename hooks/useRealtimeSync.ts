"use client";

// ============================================================
// useRealtimeSync — Board-scoped realtime subscriptions
// ============================================================
//
// Replaces the global wildcard subscription with targeted,
// board-scoped channels that apply granular patches.
// ============================================================

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Board } from "@/types";

interface RealtimeSyncOptions {
  /** The currently active board (null = unsubscribe) */
  activeBoard: Board | null;
  /** Callback when board data should be refreshed */
  onBoardDataChanged: (boardId: string) => void;
  /** Callback when board list should be refreshed */
  onBoardsChanged: () => void;
}

/**
 * Manages realtime Supabase subscriptions scoped to the active board.
 * Automatically unsubscribes/resubscribes when the active board changes.
 */
export function useRealtimeSync({
  activeBoard,
  onBoardDataChanged,
  onBoardsChanged,
}: RealtimeSyncOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (!activeBoard) return;

    const boardId = activeBoard.id;

    // Debounced refresh to batch rapid-fire events
    const debouncedRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onBoardDataChanged(boardId);
      }, 150);
    };

    // Create board-scoped channel
    const channel = supabase
      .channel(`board-${boardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `board_id=eq.${boardId}` },
        debouncedRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups", filter: `board_id=eq.${boardId}` },
        debouncedRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boards" },
        () => onBoardsChanged()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automations", filter: `board_id=eq.${boardId}` },
        debouncedRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "item_links" },
        debouncedRefresh
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [activeBoard?.id, onBoardDataChanged, onBoardsChanged]);
}
