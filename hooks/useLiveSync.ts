"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { LIVE_TABLES, assignsTo, effectOf, keyId, type LiveChange } from "@/lib/liveSync";
import type { Item, Profile } from "@/types";

/** Changes arriving together - an automation moving 50 tasks - refresh once. */
const BATCH_MS = 250;
/** How long the connection can be down before "Reconnecting…" shows. */
const SHOW_RECONNECTING_MS = 4000;
/** How long before a connection that has not come back by itself is rebuilt. */
const REBUILD_MS = 15000;
/** A tab hidden longer than this refreshes what is on screen when it comes back. */
const HIDDEN_CATCH_UP_MS = 60000;

/** Sent when comments change on a task (detail.itemId). */
export const COMMENTS_CHANGED_EVENT = "hostflow:comments-changed";
/** Sent after a gap in the connection, for state that lives outside React Query. */
export const RESYNC_EVENT = "hostflow:resync";

interface LiveSyncOptions {
  userId: string | null | undefined;
  profile: Pick<Profile, "role" | "is_staff"> | null;
  refreshProfile: () => Promise<void>;
}

/** Whether a cached query's data holds this task. */
function holdsItem(data: unknown, itemId: string): boolean {
  if (!data) return false;
  const lists = Array.isArray(data)
    ? [data]
    : [(data as { items?: unknown }).items, (data as { trashItems?: unknown }).trashItems];
  return lists.some((list) => Array.isArray(list) && (list as Item[]).some((i) => i?.id === itemId));
}

/**
 * The app's one live connection.
 *
 * It runs for as long as someone is signed in, whatever screen they are on,
 * and turns each change into the screens it affects: a task assigned to you
 * refreshes My Work even though no board is open. Only what is on screen
 * refetches; the rest is marked out of date and refreshes when opened.
 *
 * A connection drops - a laptop sleeps, Wi-Fi goes, a tab sits in the
 * background - and Realtime does not replay what changed meanwhile. So when it
 * comes back, or a tab returns after a while hidden, whatever is on screen
 * refetches once. `reconnecting` says when the screen may be out of date.
 */
export function useLiveSync({ userId, profile, refreshProfile }: LiveSyncOptions) {
  const queryClient = useQueryClient();
  const instance = useId();
  const [reconnecting, setReconnecting] = useState(false);
  // Bumped to rebuild the channel when it has not come back by itself.
  const [attempt, setAttempt] = useState(0);

  // Read inside the channel's callbacks without resubscribing when they change.
  const profileRef = useRef(profile);
  const refreshProfileRef = useRef(refreshProfile);
  useEffect(() => {
    profileRef.current = profile;
    refreshProfileRef.current = refreshProfile;
  }, [profile, refreshProfile]);

  // Across rebuilds of the channel: a rebuild after a drop still has to catch up.
  const wasLive = useRef(false);
  const missedChanges = useRef(false);

  const catchUpRef = useRef<() => void>(() => {});

  // ---- Catch-up: after a gap, refresh what is on screen.
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    catchUpRef.current = () => {
      if (timer) clearTimeout(timer);
      // Several signals arrive together (back online, then reconnected).
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries();
        void refreshProfileRef.current();
        window.dispatchEvent(new Event(RESYNC_EVENT));
      }, 500);
    };

    let hiddenAt: number | null = document.hidden ? Date.now() : null;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt > HIDDEN_CATCH_UP_MS) catchUpRef.current();
        hiddenAt = null;
      }
    };
    const onOnline = () => catchUpRef.current();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      if (timer) clearTimeout(timer);
      catchUpRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [userId, queryClient]);

  // ---- The channel.
  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

    // ---- A burst of changes becomes one refresh.
    const pendingKeys = new Map<string, readonly unknown[]>();
    const pendingItems = new Map<string, Record<string, unknown> | undefined>();
    const pendingComments = new Set<string>();
    let ownProfileChanged: Record<string, unknown> | null = null;
    let batchTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      batchTimer = null;
      const keys = new Map(pendingKeys);
      pendingKeys.clear();

      for (const [itemId, values] of pendingItems) {
        // A task moved to another board, or deleted for good, is still on
        // screen in the board it left: refresh every cached list holding it.
        for (const [key, data] of queryClient.getQueriesData({ queryKey: ["boardData"] })) {
          if (holdsItem(data, itemId)) keys.set(keyId(key), key);
        }
        // My Work reads every task, so it refreshes only for one that is, or
        // was, yours - never for each change across the company.
        const mine =
          assignsTo(values, userId) ||
          queryClient
            .getQueriesData({ queryKey: ["myWorkItems"] })
            .some(([, data]) => holdsItem(data, itemId));
        if (mine) keys.set(keyId(["myWorkItems"]), ["myWorkItems"]);
      }
      pendingItems.clear();

      if (ownProfileChanged) {
        const before = profileRef.current;
        const now = ownProfileChanged;
        ownProfileChanged = null;
        void refreshProfileRef.current();
        // Made admin, or joined or left the team: what you can see changed.
        if (!before || now.role !== before.role || now.is_staff !== before.is_staff) {
          for (const key of [queryKeys.workspaces(), queryKeys.boards(), ["accessRequests"], ["myWorkItems"]]) {
            keys.set(keyId(key), key);
          }
        }
      }

      for (const key of keys.values()) void queryClient.invalidateQueries({ queryKey: key });

      for (const itemId of pendingComments) {
        window.dispatchEvent(new CustomEvent(COMMENTS_CHANGED_EVENT, { detail: { itemId } }));
      }
      pendingComments.clear();
    };

    const onChange = (change: LiveChange) => {
      const effect = effectOf(change, userId);
      for (const key of effect.keys) pendingKeys.set(keyId(key), key);
      if (effect.itemId) pendingItems.set(effect.itemId, effect.itemValues);
      if (effect.commentsOf) pendingComments.add(effect.commentsOf);
      if (effect.ownProfile) ownProfileChanged = effect.ownProfile;
      if (!batchTimer) batchTimer = setTimeout(flush, BATCH_MS);
    };

    // ---- Connection state.
    const markLive = () => {
      if (showTimer) clearTimeout(showTimer);
      if (rebuildTimer) clearTimeout(rebuildTimer);
      showTimer = rebuildTimer = null;
      setReconnecting(false);
      if (missedChanges.current) catchUpRef.current();
      missedChanges.current = false;
      wasLive.current = true;
    };
    const markDown = () => {
      // Only a connection that was up can have missed something since.
      if (wasLive.current) missedChanges.current = true;
      if (!showTimer) showTimer = setTimeout(() => setReconnecting(true), SHOW_RECONNECTING_MS);
      if (!rebuildTimer) {
        rebuildTimer = setTimeout(() => {
          // Offline, a rebuild cannot succeed; coming back online triggers one.
          if (!disposed && navigator.onLine !== false) setAttempt((a) => a + 1);
        }, REBUILD_MS);
      }
    };

    let channel = supabase.channel(`live-sync-${instance}-${attempt}`);
    for (const table of LIVE_TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) =>
        onChange({
          table,
          eventType: payload.eventType,
          new: payload.new as Record<string, unknown>,
          old: payload.old as Record<string, unknown>,
        })
      );
    }
    channel.subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") markLive();
      else markDown();
    });
    // Not connected until it says so: a first connection that never comes up
    // shows the label too, and is rebuilt like any other.
    markDown();

    const onOffline = () => markDown();
    const onOnline = () => {
      // Rebuild at once rather than wait out Realtime's own back-off.
      if (rebuildTimer) setAttempt((a) => a + 1);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      disposed = true;
      if (showTimer) clearTimeout(showTimer);
      if (rebuildTimer) clearTimeout(rebuildTimer);
      if (batchTimer) {
        clearTimeout(batchTimer);
        flush();
      }
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      supabase.removeChannel(channel);
    };
  }, [userId, instance, attempt, queryClient]);

  // Signed out: nothing to reconnect.
  const shown = !!userId && reconnecting;
  return { reconnecting: shown };
}

