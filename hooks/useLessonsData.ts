"use client";

import { useMemo } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Board, Group, Workspace } from "@/types";
import { queryKeys } from "./queries/queryKeys";
import { fetchPortfolioItems } from "./usePortfolioData";
import { fetchDelayNotes } from "./useDelayNotes";
import { portfolioBoards } from "@/lib/dashboard/portfolio";
import { computeLessons, type TaskType } from "@/lib/dashboard/lessons";

const NO_GROUPS: Group[] = [];

/** Sorted, so the same boards in another order share one cache entry. */
function idsOf(boards: Board[]): string[] {
  return boards.map((b) => b.id).sort();
}

async function fetchGroups(boardIds: string[]): Promise<Group[]> {
  const { data, error } = await supabase.from("groups").select("*").in("board_id", boardIds);
  if (error) throw error;
  return (data ?? []) as Group[];
}

/**
 * The groups on these boards. A project review lays its tasks out group by
 * group, and names the phase each late task belongs to.
 */
export function usePortfolioGroups(boards: Board[]) {
  const boardIds = useMemo(() => idsOf(boards), [boards]);
  const { data = NO_GROUPS } = useQuery({
    queryKey: queryKeys.portfolioGroups(boardIds),
    queryFn: () => fetchGroups(boardIds),
    enabled: boardIds.length > 0,
  });
  return boardIds.length > 0 ? data : NO_GROUPS;
}

const HINT_STALE_MS = 5 * 60 * 1000;

/**
 * Every task type past projects know about, for the hint shown while a task
 * is planned. Loaded the first time it is needed and cached with the
 * Portfolio overview's own queries, so opening a board never pays for it and
 * the two never disagree.
 */
export async function loadTaskTypeIndex(
  queryClient: QueryClient,
  workspaces: Workspace[],
  boards: Board[]
): Promise<Map<string, TaskType>> {
  const scoped = portfolioBoards(workspaces, boards);
  const boardIds = idsOf(scoped);
  if (boardIds.length === 0) return new Map();
  const [items, groups, notes] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: queryKeys.portfolio(boardIds),
      queryFn: () => fetchPortfolioItems(boardIds),
      staleTime: HINT_STALE_MS,
    }),
    queryClient.fetchQuery({
      queryKey: queryKeys.portfolioGroups(boardIds),
      queryFn: () => fetchGroups(boardIds),
      staleTime: HINT_STALE_MS,
    }),
    queryClient.fetchQuery({
      queryKey: queryKeys.delayNotes(boardIds),
      queryFn: () => fetchDelayNotes(boardIds),
      staleTime: HINT_STALE_MS,
    }),
  ]);
  // Finished projects only, all of them: advice is about what usually
  // happens, not about what is happening now.
  return computeLessons({
    workspaces,
    boards: scoped,
    groups,
    items,
    notes,
    filter: { includeInProgress: false, period: "all", workspaceId: null },
  }).typeIndex;
}
