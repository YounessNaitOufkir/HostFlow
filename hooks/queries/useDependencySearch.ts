"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./queryKeys";

/** The little a picker row needs: the task, and where it lives. */
export interface DependencyCandidate {
  id: string;
  name: string;
  board_id: string;
}

/** How many matches to keep. Enough to be useful, short enough to read. */
const SEARCH_LIMIT = 120;

/** Typing one letter would ask the server about most of the account. */
export const MIN_SEARCH_LENGTH = 2;

/**
 * `%` and `_` are wildcards to ILIKE, so a task called "50% acompte" would
 * otherwise match nearly everything. Escaped rather than stripped: the
 * characters are part of the name the user is looking for.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Tasks matching a name, across every board the signed-in user can read.
 *
 * A search rather than a load: the board's own items are already in memory, but
 * the other boards' are not, and pulling every item in the account to populate
 * a dropdown is what made My Work slow. Access is settled by RLS - nothing
 * comes back that the user may not read - and the privacy rule (no private
 * workspaces) is applied by the caller through lib/dependencies/scope, which
 * knows which workspace each board belongs to.
 */
export function useDependencyItemSearch(query: string, enabled = true) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: queryKeys.dependencySearch(trimmed.toLowerCase()),
    queryFn: async (): Promise<DependencyCandidate[]> => {
      const { data, error } = await supabase
        .from("items")
        .select("id, name, board_id")
        .is("deleted_at", null)
        .ilike("name", `%${escapeLike(trimmed)}%`)
        .order("name")
        .limit(SEARCH_LIMIT);
      if (error) throw error;
      return (data || []) as DependencyCandidate[];
    },
    enabled: enabled && trimmed.length >= MIN_SEARCH_LENGTH,
    // A dropdown reopened a moment later should not ask again.
    staleTime: 30_000,
  });
}

/**
 * Names for dependencies already stored, whose tasks live on other boards.
 *
 * Without this a cross-board chip has an id and nothing to render: the id is
 * all the column stores, and the item it points at was never loaded.
 */
export function useItemsByIds(ids: string[], enabled = true) {
  const wanted = Array.from(new Set(ids.filter(Boolean)));

  return useQuery({
    queryKey: queryKeys.itemsByIds(wanted),
    queryFn: async (): Promise<DependencyCandidate[]> => {
      if (wanted.length === 0) return [];
      const { data, error } = await supabase
        .from("items")
        .select("id, name, board_id")
        .in("id", wanted);
      if (error) throw error;
      return (data || []) as DependencyCandidate[];
    },
    enabled: enabled && wanted.length > 0,
    // These change only when a task is renamed, which is rare and visible
    // elsewhere; refetching per cell per render is not worth the requests.
    staleTime: 5 * 60_000,
  });
}
