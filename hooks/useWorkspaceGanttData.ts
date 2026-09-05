"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Automation, Board, Item, Group, ItemLink } from "@/types";
import { queryKeys } from "./queries/queryKeys";
import { fetchAllRows, chunkIds } from "@/lib/supabasePaging";

const EMPTY = {
  items: [] as Item[],
  groups: [] as Group[],
  itemLinks: [] as ItemLink[],
  automations: [] as Automation[],
};

export interface WorkspaceGanttData {
  loading: boolean;
  error: unknown;
  items: Item[];
  groups: Group[];
  itemLinks: ItemLink[];
  /** Rules that apply to a given board, board-scoped and workspace-scoped alike. */
  automationsFor: (board: Board) => Automation[];
  /**
   * Re-reads the plan now. A mutation made from this view writes to the board
   * store, which this query does not read, so without this the change only
   * appears when the realtime event lands - if it lands.
   */
  refresh: () => void;
}

/**
 * Everything the Master Gantt plots, across every selected board.
 *
 * Four things this has to get right that the single-board query does not:
 *
 *  - **Paging.** A workspace easily exceeds PostgREST's 1000-row cap, and a
 *    capped response arrives looking like a complete one.
 *  - **Trash.** Soft-deleted items live in the same table; without the filter
 *    they were drawn on the chart as live work.
 *  - **Both ends of a link.** Fetching only by `source_item_id` dropped any
 *    dependency whose predecessor sat in a board the user had not ticked, so
 *    an arrow could vanish because of an unrelated filter choice.
 *  - **Automations.** Dragging a bar here writes through the same path as the
 *    board Gantt, so the rules that would fire there have to be loaded here -
 *    otherwise the same drag cascades dependent dates on one screen and not
 *    on the other.
 */
export function useWorkspaceGanttData(boards: Board[]): WorkspaceGanttData {
  const queryClient = useQueryClient();

  // Sorted and joined, so the cache key does not change with the order a Set
  // happened to iterate in and re-fetch the same boards under a different name.
  const boardIdKey = useMemo(
    () => boards.map((b) => b.id).sort().join(","),
    [boards]
  );
  const workspaceIdKey = useMemo(
    () =>
      Array.from(new Set(boards.map((b) => b.workspace_id).filter(Boolean)))
        .sort()
        .join(","),
    [boards]
  );

  const boardIds = useMemo(
    () => boardIdKey.split(",").filter(Boolean),
    [boardIdKey]
  );
  const workspaceIds = useMemo(
    () => workspaceIdKey.split(",").filter(Boolean),
    [workspaceIdKey]
  );

  const queryKey = queryKeys.workspaceGantt(boardIds);

  const { data = EMPTY, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (boardIds.length === 0) return EMPTY;

      const [items, groups, automations] = await Promise.all([
        fetchAllRows<Item>((from, to) =>
          supabase
            .from("items")
            .select("*")
            .in("board_id", boardIds)
            .is("deleted_at", null)
            .order("position")
            .range(from, to)
        ),
        fetchAllRows<Group>((from, to) =>
          supabase
            .from("groups")
            .select("*")
            .in("board_id", boardIds)
            .order("position")
            .range(from, to)
        ),
        fetchAutomations(boardIds, workspaceIds),
      ]);

      const itemLinks = await fetchItemLinks(items.map((i) => i.id));

      return { items, groups, itemLinks, automations };
    },
    enabled: boardIds.length > 0,
  });

  const automationsFor = useMemo(() => {
    return (board: Board) =>
      data.automations.filter(
        (a) =>
          a.board_id === board.id ||
          (!!a.workspace_id && a.workspace_id === board.workspace_id)
      );
  }, [data.automations]);

  // The board-scoped realtime channel only runs when a board is open, and the
  // Master Gantt deliberately opens none - so without this the chart showed
  // whatever was true when it mounted and never moved again.
  useEffect(() => {
    if (boardIds.length === 0) return;

    const boardIdSet = new Set(boardIds);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey });
      }, 200);
    };

    type ChangePayload = {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    };

    const touchesSelectedBoard = (payload: ChangePayload) => {
      const boardId = payload?.new?.board_id ?? payload?.old?.board_id;
      return typeof boardId !== "string" || boardIdSet.has(boardId);
    };

    const channel = supabase
      .channel("workspace-gantt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items" },
        (payload) => {
          if (touchesSelectedBoard(payload)) refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups" },
        (payload) => {
          if (touchesSelectedBoard(payload)) refresh();
        }
      )
      // Links carry no board_id, so any change to one is worth a refresh.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "item_links" },
        refresh
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardIdKey, queryClient]);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, boardIdKey]
  );

  return {
    loading: isLoading,
    error,
    items: data.items,
    groups: data.groups,
    itemLinks: data.itemLinks,
    automationsFor,
    refresh,
  };
}

/**
 * Rules reaching these boards, matching what `automations_for_board` returns:
 * board-scoped rules plus the workspace-scoped rules that cover them.
 */
async function fetchAutomations(
  boardIds: string[],
  workspaceIds: string[]
): Promise<Automation[]> {
  const filters = [`board_id.in.(${boardIds.join(",")})`];
  if (workspaceIds.length > 0) {
    filters.push(`workspace_id.in.(${workspaceIds.join(",")})`);
  }

  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .or(filters.join(","));

  if (error) {
    // Losing the rules costs a cascade, not the chart.
    console.error("Failed to fetch automations for the Master Gantt:", error);
    return [];
  }
  return (data || []) as Automation[];
}

/**
 * Links touching any of these items, in either direction.
 *
 * Chunked because the ids travel in the query string, and de-duplicated because
 * a link whose two ends land in different chunks comes back twice.
 */
async function fetchItemLinks(itemIds: string[]): Promise<ItemLink[]> {
  if (itemIds.length === 0) return [];

  const byId = new Map<string, ItemLink>();

  for (const chunk of chunkIds(itemIds, 50)) {
    const list = chunk.join(",");
    const { data, error } = await supabase
      .from("item_links")
      .select("*")
      .or(`source_item_id.in.(${list}),target_item_id.in.(${list})`);

    if (error) {
      // A missing arrow is better than a blank chart, which is what throwing here would give.
      console.error("Failed to fetch item links for the Master Gantt:", error);
      continue;
    }
    for (const link of (data || []) as ItemLink[]) byId.set(link.id, link);
  }

  return Array.from(byId.values());
}
