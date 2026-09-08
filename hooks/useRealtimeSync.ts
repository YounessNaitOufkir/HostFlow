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
  /** Callback when the workspace list should be refreshed */
  onWorkspacesChanged?: () => void;
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
  onWorkspacesChanged,
  onGlobalSettingsChanged,
}: RealtimeSyncOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const globalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  // Read from the multi-tab effect below without making it re-subscribe its
  // BroadcastChannel on every board switch — see that effect's own comment.
  const activeBoardIdRef = useRef<string | null>(activeBoard?.id ?? null);

  useEffect(() => {
    activeBoardIdRef.current = activeBoard?.id ?? null;
  }, [activeBoard?.id]);

  useEffect(() => {
    // Setup global settings channel (runs once or when callback changes)
    if (onGlobalSettingsChanged && !globalChannelRef.current) {
      const globalChannel = supabase
        .channel('global-settings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_settings' }, onGlobalSettingsChanged)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, onGlobalSettingsChanged)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, onGlobalSettingsChanged)
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

  // Same-origin multi-tab sync (BroadcastChannel), independent of whether a
  // board is currently open. A rename made from a tab sitting on My Work,
  // Trash, or Workspace Overview must still reach a tab that has no active
  // board — the old version of this effect lived inside the board-gated one
  // below and returned before ever subscribing when `activeBoard` was null,
  // so those views never received cross-tab updates at all.
  useEffect(() => {
    if (typeof window === "undefined" || !window.BroadcastChannel) return;

    let bc: BroadcastChannel | null = null;
    let localDebounce: NodeJS.Timeout | null = null;
    try {
      bc = new BroadcastChannel("hostflow_tab_sync");
      bc.onmessage = (event) => {
        const data = event.data;
        if (!data) return;
        if (data.type === "SYNC_BOARD") {
          if (data.boardId !== activeBoardIdRef.current) return;
          if (localDebounce) clearTimeout(localDebounce);
          localDebounce = setTimeout(() => onBoardDataChanged(data.boardId), 150);
        } else if (data.type === "SYNC_BOARDS") {
          onBoardsChanged();
        } else if (data.type === "SYNC_WORKSPACES") {
          onWorkspacesChanged?.();
        }
      };
    } catch (e) {
      // ignore
    }

    return () => {
      if (localDebounce) clearTimeout(localDebounce);
      if (bc) {
        try {
          bc.close();
        } catch (e) {}
      }
    };
  }, [onBoardDataChanged, onBoardsChanged, onWorkspacesChanged]);

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

/**
 * Broadcasts to every open tab on this origin that one board's own data
 * (items/groups/links/automations) changed.
 */
function postTabSync(message: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.BroadcastChannel) {
    try {
      const bc = new BroadcastChannel("hostflow_tab_sync");
      bc.postMessage(message);
      bc.close();
    } catch (e) {}
  }
}

export function notifyTabSync(boardId: string) {
  postTabSync({ type: "SYNC_BOARD", boardId });
}

/**
 * Broadcasts that the board list itself (or a field living on a board row,
 * such as `columns` or `item_name_column`) changed — a board created,
 * renamed, deleted, or had a column added/renamed/reordered elsewhere.
 */
export function notifyTabSyncBoards() {
  postTabSync({ type: "SYNC_BOARDS" });
}

/** Broadcasts that the workspace list changed: created, renamed, or deleted. */
export function notifyTabSyncWorkspaces() {
  postTabSync({ type: "SYNC_WORKSPACES" });
}
