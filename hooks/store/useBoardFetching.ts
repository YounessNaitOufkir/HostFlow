import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Board, Item, Profile, ItemLink } from "@/types";
import type { BoardStoreDispatch } from "./types";
import { reportFetchError } from "@/lib/errorReporting";

export function useBoardFetching(dispatch: BoardStoreDispatch) {
  const fetchWorkspaces = useCallback(
    async (profile: Profile | null) => {
      try {
        const { data } = await supabase
          .from("workspaces")
          .select("*")
          .order("name");
        if (data && data.length > 0) {
          const savedWsId =
            typeof window !== "undefined"
              ? localStorage.getItem("monday_clone_active_workspace_id")
              : null;
          const savedWs = savedWsId
            ? data.find((ws) => ws.id === savedWsId)
            : null;
          dispatch({
            type: "SET_WORKSPACES",
            payload: { workspaces: data, active: savedWs || null },
          });
        } else {
          dispatch({
            type: "SET_WORKSPACES",
            payload: { workspaces: [], active: null },
          });
        }
      } catch (err) {
        reportFetchError(err, "Failed to load workspaces", {
          table: "workspaces",
        });
      }
    },
    [dispatch]
  );

  const fetchProfiles = useCallback(async () => {
    try {
      // See useGlobalQueries: names come from the directory view, not profiles.
      const { data } = await supabase.from("user_directory").select("*");
      if (data) dispatch({ type: "SET_PROFILES", payload: data });
    } catch (err) {
      reportFetchError(err, "Failed to load team profiles", {
        table: "profiles",
      });
    }
  }, [dispatch]);

  const fetchGlobalSettings = useCallback(async () => {
    try {
      const [orgRes, teamsRes, labelsRes] = await Promise.all([
        supabase.from("organization_settings").select("*").limit(1).single(),
        supabase.from("teams").select("*").order("name"),
        supabase.from("global_status_labels").select("*").order("position"),
      ]);

      if (orgRes.data)
        dispatch({ type: "SET_ORGANIZATION_SETTINGS", payload: orgRes.data });
      if (teamsRes.data)
        dispatch({ type: "SET_TEAMS", payload: teamsRes.data });
      if (labelsRes.data)
        dispatch({
          type: "SET_GLOBAL_STATUS_LABELS",
          payload: labelsRes.data,
        });
    } catch (err) {
      reportFetchError(err, "Failed to load settings", {
        table: "organization_settings",
      });
    }
  }, [dispatch]);

  const fetchBoards = useCallback(
    async (
      profile: Profile | null,
      currentActiveBoard: Board | null,
      silent = false
    ) => {
      if (!silent && !currentActiveBoard)
        dispatch({ type: "SET_LOADING", payload: true });
      try {
        const { data } = await supabase.from("boards").select("*").order("id");
        if (data && data.length > 0) {
          dispatch({ type: "SET_BOARDS", payload: data });
          if (!currentActiveBoard) {
            const savedBoardId =
              typeof window !== "undefined"
                ? localStorage.getItem("monday_clone_active_board_id")
                : null;
            const savedBoard = savedBoardId
              ? data.find((b) => b.id === savedBoardId)
              : null;
            dispatch({
              type: "SET_ACTIVE_BOARD",
              payload: savedBoard || null,
            });
            dispatch({ type: "SET_LOADING", payload: false });
            return savedBoard || null;
          } else {
            const updated = data.find((b) => b.id === currentActiveBoard.id);
            if (updated)
              dispatch({ type: "SET_ACTIVE_BOARD", payload: updated });
            dispatch({ type: "SET_LOADING", payload: false });
            return null;
          }
        } else {
          dispatch({ type: "SET_BOARDS", payload: [] });
          dispatch({ type: "SET_ACTIVE_BOARD", payload: null });
          dispatch({ type: "SET_LOADING", payload: false });
        }
      } catch (err) {
        reportFetchError(err, "Failed to load boards", { table: "boards" });
        dispatch({ type: "SET_LOADING", payload: false });
      }
      return null;
    },
    [dispatch]
  );

  const fetchBoardData = useCallback(
    async (boardId: string, silent = false) => {
      try {
        const [groupsRes, itemsRes, automationsRes] = await Promise.all([
          supabase
            .from("groups")
            .select("*")
            .eq("board_id", boardId)
            .order("position"),
          supabase
            .from("items")
            .select("*")
            .eq("board_id", boardId)
            .order("position"),
          supabase.from("automations").select("*").eq("board_id", boardId),
        ]);

        let fetchedLinks: ItemLink[] = [];
        const allItems = itemsRes.data || [];
        const activeItems = allItems.filter((i: Item) => !i.deleted_at);
        const trashItems = allItems.filter((i: Item) => !!i.deleted_at);

        if (allItems.length > 0) {
          const itemIds = allItems.map((i: Item) => i.id);
          const { data: linksData } = await supabase
            .from("item_links")
            .select("*")
            .or(
              `source_item_id.in.(${itemIds.join(
                ","
              )}),target_item_id.in.(${itemIds.join(",")})`
            );
          if (linksData) fetchedLinks = linksData;
        }

        dispatch({
          type: "SET_BOARD_DATA",
          payload: {
            groups: groupsRes.data || [],
            items: activeItems,
            automations: automationsRes.data || [],
            itemLinks: fetchedLinks,
          },
        });
        dispatch({ type: "SET_TRASH_ITEMS", payload: trashItems });
      } catch (err) {
        reportFetchError(err, "Failed to load board data", {
          table: "items",
        });
      }
      if (!silent) dispatch({ type: "SET_LOADING", payload: false });
    },
    [dispatch]
  );

  const fetchMyWorkItems = useCallback(
    async (profile: Profile, boards: Board[]) => {
      try {
        const { data } = await supabase.from("items").select("*");
        if (data) {
          const myItems = data.filter((item) => {
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
          dispatch({ type: "SET_MY_WORK_ITEMS", payload: myItems });
        }
      } catch (err) {
        reportFetchError(err, "Failed to load your assigned items", {
          table: "items",
        });
      }
    },
    [dispatch]
  );

  return {
    fetchWorkspaces,
    fetchProfiles,
    fetchGlobalSettings,
    fetchBoards,
    fetchBoardData,
    fetchMyWorkItems,
  };
}
