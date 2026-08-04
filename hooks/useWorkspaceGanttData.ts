"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Item, Group, ItemLink } from "@/types";
import { queryKeys } from "./queries/queryKeys";

export function useWorkspaceGanttData(boardIds: string[]) {
  const {
    data = { items: [], groups: [], itemLinks: [] },
    isLoading: loading,
  } = useQuery({
    queryKey: queryKeys.workspaceGantt(boardIds),
    queryFn: async () => {
      if (boardIds.length === 0) {
        return { items: [], groups: [], itemLinks: [] };
      }

      const [iRes, gRes] = await Promise.all([
        supabase.from("items").select("*").in("board_id", boardIds),
        supabase.from("groups").select("*").in("board_id", boardIds),
      ]);

      if (iRes.error) throw iRes.error;
      if (gRes.error) throw gRes.error;

      const items = (iRes.data || []) as Item[];
      const groups = (gRes.data || []) as Group[];
      let itemLinks: ItemLink[] = [];

      if (items.length > 0) {
        const itemIds = items.map((i) => i.id);
        const lRes = await supabase.from("item_links").select("*").in("source_item_id", itemIds);
        if (lRes.error) throw lRes.error;
        if (lRes.data) itemLinks = lRes.data as ItemLink[];
      }

      return { items, groups, itemLinks };
    },
    enabled: boardIds.length > 0,
  });

  return { loading, items: data.items, groups: data.groups, itemLinks: data.itemLinks };
}
