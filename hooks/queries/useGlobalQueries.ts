"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./queryKeys";
import {
  OrganizationSettings,
  Team,
  GlobalStatusLabel,
  Workspace,
  Profile,
  Board,
  Item,
} from "@/types";

export function useGlobalSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.globalSettings(),
    queryFn: async () => {
      const [orgRes, teamsRes, labelsRes] = await Promise.all([
        supabase.from("organization_settings").select("*").limit(1).single(),
        supabase.from("teams").select("*").order("name"),
        supabase.from("global_status_labels").select("*").order("position"),
      ]);

      return {
        organizationSettings: (orgRes.data || null) as OrganizationSettings | null,
        teams: (teamsRes.data || []) as Team[],
        globalStatusLabels: (labelsRes.data || []) as GlobalStatusLabel[],
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
      const { data, error } = await supabase.from("boards").select("*").order("id");
      if (error) throw error;
      return (data || []) as Board[];
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
      const { data, error } = await supabase.from("items").select("*");
      if (error) throw error;
      const allItems = (data || []) as Item[];

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
