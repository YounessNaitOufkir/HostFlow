"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Item, Group, ItemLink } from "@/types";

export function useWorkspaceGanttData(boardIds: string[]) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [itemLinks, setItemLinks] = useState<ItemLink[]>([]);

  useEffect(() => {
    async function fetchData() {
      if (boardIds.length === 0) {
        setItems([]);
        setGroups([]);
        setItemLinks([]);
        return;
      }
      setLoading(true);
      try {
        const [iRes, gRes] = await Promise.all([
          supabase.from("items").select("*").in("board_id", boardIds),
          supabase.from("groups").select("*").in("board_id", boardIds)
        ]);
        
        if (iRes.data) setItems(iRes.data);
        if (gRes.data) setGroups(gRes.data);

        if (iRes.data && iRes.data.length > 0) {
          const itemIds = iRes.data.map(i => i.id);
          const lRes = await supabase.from("item_links").select("*").in("source_item_id", itemIds);
          if (lRes.data) setItemLinks(lRes.data);
        } else {
          setItemLinks([]);
        }
      } catch (error) {
        console.error("Failed to fetch workspace gantt data:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [boardIds.join(",")]);

  return { loading, items, groups, itemLinks };
}
