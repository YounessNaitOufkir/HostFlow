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
  /** Callback when global settings should be refreshed */
  onGlobalSettingsChanged?: () => void;
}

/**
 * Manages realtime Supabase subscriptions scoped to the active board.
 * Automatically unsubscribes/resubscribes when the active board changes.
 */
export function useRealtimeSync({
  activeBoard,
  onBoardDataChanged,
  onBoardsChanged,
  onGlobalSettingsChanged,
}: RealtimeSyncOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const globalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Setup global settings channel (runs once or when callback changes)
    if (onGlobalSettingsChanged && !globalChannelRef.current) {
      const globalChannel = supabase
        .channel('global-settings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_settings' }, onGlobalSettingsChanged)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, onGlobalSettingsChanged)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, onGlobalSettingsChanged)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'global_status_labels' }, onGlobalSettingsChanged)
        .subscribe();
      
      globalChannelRef.current = globalChannel;
    }

    return () => {
      if (globalChannelRef.current) {
        supabase.removeChannel(globalChannelRef.current);
        globalChannelRef.current = null;
      }
    };
  }, [onGlobalSettingsChanged]);

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

    // Listen for same-origin multi-tab BroadcastChannel updates
    let bc: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && window.BroadcastChannel) {
      try {
        bc = new BroadcastChannel("hostflow_tab_sync");
        bc.onmessage = (event) => {
          if (event.data && (event.data.boardId === boardId || event.data.type === "SYNC_ALL")) {
            debouncedRefresh();
          }
        };
      } catch (e) {
        // ignore
      }
    }

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
      if (bc) {
        try {
          bc.close();
        } catch (e) {}
      }
    };
  }, [activeBoard?.id, onBoardDataChanged, onBoardsChanged]);
}

/**
 * Broadcast a synchronization signal to all open client browser tabs on the same origin.
 */
export function notifyTabSync(boardId: string) {
  if (typeof window !== "undefined" && window.BroadcastChannel) {
    try {
      const bc = new BroadcastChannel("hostflow_tab_sync");
      bc.postMessage({ type: "SYNC_BOARD", boardId });
      bc.close();
    } catch (e) {}
  }
}
