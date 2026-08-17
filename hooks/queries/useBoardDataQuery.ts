"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./queryKeys";
import { Group, Item, ItemLink, Automation } from "@/types";

export interface BoardDataQueryResult {
  groups: Group[];
  items: Item[];
  trashItems: Item[];
  automations: Automation[];
  itemLinks: ItemLink[];
}

export function useBoardDataQuery(boardId: string | null, enabled = true) {
  return useQuery<BoardDataQueryResult>({
    queryKey: queryKeys.boardData(boardId || ""),
    queryFn: async () => {
      if (!boardId) {
        return {
          groups: [],
          items: [],
          trashItems: [],
          automations: [],
          itemLinks: [],
        };
      }

      const [groupsRes, itemsRes, automationsRes] = await Promise.all([
        supabase.from("groups").select("*").eq("board_id", boardId).order("position"),
        supabase.from("items").select("*").eq("board_id", boardId).order("position"),
        supabase.from("automations").select("*").eq("board_id", boardId),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (automationsRes.error) throw automationsRes.error;

      let fetchedLinks: ItemLink[] = [];
      const allItems = (itemsRes.data || []) as Item[];
      const activeItems = allItems.filter((i: Item) => !i.deleted_at);
      const trashItems = allItems.filter((i: Item) => !!i.deleted_at);

      if (allItems.length > 0) {
        const itemIds = allItems.map((i: Item) => i.id);
        
        // Chunk itemIds to avoid URI Too Long error from Supabase
        const CHUNK_SIZE = 50;
        const chunks = [];
        for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
          chunks.push(itemIds.slice(i, i + CHUNK_SIZE));
        }
        
        for (const chunk of chunks) {
          const { data: linksData, error: linksError } = await supabase
            .from("item_links")
            .select("*")
            .or(`source_item_id.in.(${chunk.join(",")}),target_item_id.in.(${chunk.join(",")})`);
            
          if (linksError) {
            console.error("Failed to fetch item links:", linksError);
            // Don't throw, just ignore links if they fail so the board still loads
            continue;
          }
          if (linksData) fetchedLinks.push(...(linksData as ItemLink[]));
        }
      }

      return {
        groups: (groupsRes.data || []) as Group[],
        items: activeItems,
        trashItems: trashItems,
        automations: (automationsRes.data || []) as Automation[],
        itemLinks: fetchedLinks,
      };
    },
    enabled: Boolean(boardId && enabled),
  });
}
