"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Board, Item } from "@/types";
import { queryKeys } from "./queries/queryKeys";
import { fetchAllRows } from "@/lib/supabasePaging";

const NO_ITEMS: Item[] = [];

/** Every live task on these boards, paged past PostgREST's row cap. Shared with the planning hint. */
export function fetchPortfolioItems(boardIds: string[]): Promise<Item[]> {
  return fetchAllRows<Item>((from, to) =>
    supabase
      .from("items")
      .select("*")
      .in("board_id", boardIds)
      .is("deleted_at", null)
      .order("id")
      .range(from, to)
  );
}

/**
 * Every live task on the given boards, paged past PostgREST's row cap.
 *
 * RLS filters each row by `can_access_board`, so asking for a board the viewer
 * cannot open returns nothing from it rather than an error.
 */
export function usePortfolioData(boards: Board[]) {
  // Sorted so the cache key does not change when the same boards arrive in a different order.
  const boardIdKey = useMemo(() => boards.map((b) => b.id).sort().join(","), [boards]);
  const boardIds = useMemo(() => boardIdKey.split(",").filter(Boolean), [boardIdKey]);
  const queryKey = queryKeys.portfolio(boardIds);

  const { data = NO_ITEMS, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchPortfolioItems(boardIds),
    enabled: boardIds.length > 0,
  });

  // Kept current by useLiveSync, which refreshes it whenever a task changes.

  return {
    items: boardIds.length > 0 ? data : NO_ITEMS,
    loading: boardIds.length > 0 && isLoading,
    error,
    retry: () => void refetch(),
  };
}
