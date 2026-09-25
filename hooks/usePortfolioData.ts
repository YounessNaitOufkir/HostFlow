"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Board, Item } from "@/types";
import { queryKeys } from "./queries/queryKeys";
import { fetchAllRows } from "@/lib/supabasePaging";

const NO_ITEMS: Item[] = [];

/**
 * Every live task on the given boards, paged past PostgREST's row cap.
 *
 * RLS filters each row by `can_access_board`, so asking for a board the viewer
 * cannot open returns nothing from it rather than an error.
 */
export function usePortfolioData(boards: Board[]) {
  const queryClient = useQueryClient();

  // Sorted so the cache key does not change when the same boards arrive in a different order.
  const boardIdKey = useMemo(() => boards.map((b) => b.id).sort().join(","), [boards]);
  const boardIds = useMemo(() => boardIdKey.split(",").filter(Boolean), [boardIdKey]);
  const queryKey = queryKeys.portfolio(boardIds);

  const { data = NO_ITEMS, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      fetchAllRows<Item>((from, to) =>
        supabase
          .from("items")
          .select("*")
          .in("board_id", boardIds)
          .is("deleted_at", null)
          .order("id")
          .range(from, to)
      ),
    enabled: boardIds.length > 0,
  });

  // No board is open on this page, so the board-scoped realtime channel is not running.
  useEffect(() => {
    if (boardIds.length === 0) return;
    const boardIdSet = new Set(boardIds);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel("portfolio-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, (payload) => {
        const row = (payload.new as { board_id?: string } | null) ?? (payload.old as { board_id?: string } | null);
        const boardId = row?.board_id;
        if (typeof boardId === "string" && !boardIdSet.has(boardId)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: ["portfolio"] }), 200);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardIdKey, queryClient]);

  return {
    items: boardIds.length > 0 ? data : NO_ITEMS,
    loading: boardIds.length > 0 && isLoading,
    error,
    retry: () => void refetch(),
  };
}
