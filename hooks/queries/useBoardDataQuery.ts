"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./queryKeys";
import { Group, Item, ItemLink, Automation } from "@/types";
import { fetchAllRows, chunkIds } from "@/lib/supabasePaging";

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

      // Paged, not a single select: PostgREST caps a response at db.max_rows
      // (1000 by default) and says nothing about it. A board past that limit
      // rendered a partial plan in every view - table, kanban, cards and the
      // Gantt - with no sign that anything was missing.
      const [groups, allItems, automationsRes] = await Promise.all([
        fetchAllRows<Group>((from, to) =>
          supabase
            .from("groups")
            .select("*")
            .eq("board_id", boardId)
            .order("position")
            .range(from, to)
        ),
        fetchAllRows<Item>((from, to) =>
          supabase
            .from("items")
            .select("*")
            .eq("board_id", boardId)
            .order("position")
            .range(from, to)
        ),
        supabase.rpc("automations_for_board", { b_id: boardId }),
      ]);

      if (automationsRes.error) throw automationsRes.error;

      const fetchedLinks: ItemLink[] = [];
      const activeItems = allItems.filter((i: Item) => !i.deleted_at);
      const trashItems = allItems.filter((i: Item) => !!i.deleted_at);

      if (allItems.length > 0) {
        // Chunked to avoid a URI Too Long: the ids travel in the query string.
        const chunks = chunkIds(allItems.map((i: Item) => i.id), 50);

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
        groups,
        items: activeItems,
        trashItems: trashItems,
        automations: (automationsRes.data || []) as Automation[],
        itemLinks: fetchedLinks,
      };
    },
    enabled: Boolean(boardId && enabled),
  });
}
