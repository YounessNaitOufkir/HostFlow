"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * The OS taskbar/dock badge on the installed app's icon — the unread
 * notification count, so it's visible without switching to the app (Slack,
 * Outlook do the same). Chromium and Safari support the Badging API; other
 * browsers silently lack `navigator.setAppBadge` and this is a no-op there.
 *
 * A dedicated exact COUNT query rather than reusing NotificationsMenu's own
 * unread number: that component only fetches the latest 20 rows for its
 * dropdown, which undercounts once someone has more than 20 unread. The two
 * numbers can only ever agree or have this one be more accurate — never the
 * other way — so there's no real inconsistency to worry about.
 */
export function useAppBadge(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId || typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;

    let cancelled = false;
    const setBadge = (count: number) => {
      if (cancelled) return;
      if (count > 0) navigator.setAppBadge?.(count).catch(() => {});
      else navigator.clearAppBadge?.().catch(() => {});
    };

    const refresh = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("read", false);
      setBadge(count ?? 0);
    };

    refresh();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 200);
    };

    const channel = supabase
      .channel(`app-badge-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
      navigator.clearAppBadge?.().catch(() => {});
    };
  }, [userId]);
}
