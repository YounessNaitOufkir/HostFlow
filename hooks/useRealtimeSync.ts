"use client";

// ============================================================
// useRealtimeSync — same-browser tab sync
// ============================================================
//
// Changes from the database arrive through useLiveSync, which runs whatever
// screen is open. This is the instant path between two tabs of the same
// browser: a tab that saved something tells the others straight away, before
// the database's own broadcast arrives.
// ============================================================

import { useEffect, useRef } from "react";
import type { Board } from "@/types";

interface RealtimeSyncOptions {
  /** The currently active board */
  activeBoard: Board | null;
  /** Callback when board data should be refreshed */
  onBoardDataChanged: (boardId: string) => void;
  /** Callback when board list should be refreshed */
  onBoardsChanged: () => void;
  /** Callback when the workspace list should be refreshed */
  onWorkspacesChanged?: () => void;
}

export function useRealtimeSync({
  activeBoard,
  onBoardDataChanged,
  onBoardsChanged,
  onWorkspacesChanged,
}: RealtimeSyncOptions) {
  // Read from the effect below without making it re-subscribe its
  // BroadcastChannel on every board switch.
  const activeBoardIdRef = useRef<string | null>(activeBoard?.id ?? null);

  useEffect(() => {
    activeBoardIdRef.current = activeBoard?.id ?? null;
  }, [activeBoard?.id]);

  // Independent of whether a board is open: a rename made from a tab sitting
  // on My Work, Trash, or Workspace Overview must still reach a tab that has
  // no active board.
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
