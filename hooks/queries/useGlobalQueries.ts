"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./queryKeys";
import {
  OrganizationSettings,
  Team,
  Workspace,
  Profile,
  Board,
  Item,
} from "@/types";
import { fetchAllRows } from "@/lib/supabasePaging";

export function useGlobalSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.globalSettings(),
    queryFn: async () => {
      const [orgRes, teamsRes] = await Promise.all([
        supabase.from("organization_settings").select("*").limit(1).single(),
        supabase.from("teams").select("*").order("name"),
      ]);

      return {
        organizationSettings: (orgRes.data || null) as OrganizationSettings | null,
        teams: (teamsRes.data || []) as Team[],
      };
    },
    enabled,
  });
}

export function useWorkspacesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: async () => {
      const { data, error } = await supabase.from("workspaces").select("*").order("name");
      if (error) throw error;
      return (data || []) as Workspace[];
    },
    enabled,
  });
}

export function useProfilesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.profiles(),
    queryFn: async () => {
      // user_directory, not profiles: it exposes names without emails and is
      // already scoped to people you share a workspace or board with.
      const { data, error } = await supabase.from("user_directory").select("*");
      if (error) throw error;
      return (data || []) as Profile[];
    },
    enabled,
  });
}

export function useBoardsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.boards(),
    queryFn: async () => {
      return fetchAllRows<Board>((from, to) =>
        supabase.from("boards").select("*").order("id").range(from, to)
      );
    },
    enabled,
  });
}

export function useMyWorkQuery(
  profile: Profile | null,
  boards: Board[],
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.myWorkItems(profile?.id || ""),
    queryFn: async () => {
      if (!profile) return [];

      // Paged, and trash left behind. This reads every item the user can see -
      // assignment lives in a per-board JSONB key, so it cannot be filtered
      // server-side - which means it was both capped at 1000 rows and listing
      // tasks that had been deleted.
      const allItems = await fetchAllRows<Item>((from, to) =>
        supabase.from("items").select("*").is("deleted_at", null).range(from, to)
      );

      return allItems.filter((item) => {
        const board = boards.find((b) => b.id === item.board_id);
        if (!board) return false;
        const peopleCols = board.columns.filter((c) => c.type === "people");
        return peopleCols.some((col) => {
          let val = item.column_values?.[col.id];
          if (typeof val === 'string') {
            try { val = JSON.parse(val); } catch(e) {}
          }
          return Array.isArray(val) && val.includes(profile.id);
        });
      });
    },
    enabled: Boolean(profile && enabled),
  });
}
