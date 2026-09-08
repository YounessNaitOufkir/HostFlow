import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Board, Profile, Column } from "@/types";
import type { BoardStoreDispatch } from "./types";
import { reportMutationError, runWrite } from "@/lib/errorReporting";
import { getQueryClient } from "@/components/QueryProvider";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { notifyTabSyncBoards } from "@/hooks/useRealtimeSync";

interface UseBoardMutationsProps {
  dispatch: BoardStoreDispatch;
  requestPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
}

export function useBoardMutations({
  dispatch,
  requestPrompt,
}: UseBoardMutationsProps) {
  const switchBoard = useCallback(
    (board: Board | null) => {
      dispatch({ type: "SET_ACTIVE_BOARD", payload: board });
      if (board) {
        dispatch({ type: "SET_GROUPS", payload: [] });
        dispatch({ type: "SET_ITEMS", payload: [] });
        dispatch({ type: "SET_MAIN_VIEW", payload: "board" });
      }
    },
    [dispatch]
  );

  const createBoard = useCallback(
    async (workspaceId?: string, currentProfile?: Profile | null) => {
      const boardName = await requestPrompt("Enter new board name:");
      if (!boardName) return;
      const wsId =
        workspaceId ||
        (await supabase.from("workspaces").select("id").limit(1).single())
          .data?.id;
      // The columns a board is actually worked with, so a new board is usable
      // immediately instead of needing seven columns added by hand. Ids are
      // generated the same way the importer does it, rather than the fixed
      // 'status'/'date' strings this used before - two boards created that way
      // shared column ids, which automations match on.
      const defaultColumns: Column[] = [
        { id: crypto.randomUUID(), title: "Timeline", type: "timeline" },
        { id: crypto.randomUUID(), title: "Assignee", type: "people" },
        { id: crypto.randomUUID(), title: "Dependency", type: "dependency" },
        { id: crypto.randomUUID(), title: "Tags", type: "tags" },
        { id: crypto.randomUUID(), title: "Status", type: "status" },
        { id: crypto.randomUUID(), title: "Priority", type: "priority" },
        { id: crypto.randomUUID(), title: "Notes", type: "text" },
      ];
      try {
        const { data, error } = await supabase
          .from("boards")
          .insert({
            name: boardName,
            description: "New project board",
            workspace_id: wsId,
            columns: defaultColumns,
          })
          .select()
          .single();
        if (error) throw error;
        if (data) {
          // A board with no groups renders "No groups yet" and shows none of
          // its columns, so the defaults above would be invisible until the
          // user added a group by hand. Start it with one.
          const { error: groupErr } = await supabase.from("groups").insert({
            id: crypto.randomUUID(),
            board_id: data.id,
            title: "New Group",
            color: "#579bfc",
            position: 0,
          });
          if (groupErr) {
            reportMutationError(groupErr, "Board created, but its first group could not be added", {
              table: "groups",
              operation: "insert",
            });
          }

          // The creator used to be granted access by appending to
          // profiles.allowed_boards. That array is retired — access now comes
          // from boards.created_by (set by the set_created_by trigger) plus
          // workspace/board membership — so this wrote to a column nothing
          // reads. It also keyed off the 'contractor' role, which no longer
          // exists. Removed rather than left as a misleading no-op.
          dispatch({ type: "ADD_BOARD", payload: data });
          getQueryClient().invalidateQueries({
            queryKey: queryKeys.boards(),
          });
          notifyTabSyncBoards();
          switchBoard(data);
        }
      } catch (err) {
        reportMutationError(err, "Failed to create board", {
          table: "boards",
          operation: "insert",
        });
      }
    },
    [dispatch, requestPrompt, switchBoard]
  );

  const renameBoard = useCallback(
    async (board: Board) => {
      const newName = await requestPrompt("Enter new board name:", board.name);
      if (newName && newName !== board.name) {
        // runWrite, not a bare try/catch: supabase-js RESOLVES with { error } on
        // a PostgREST failure such as an RLS denial, so the catch never ran and
        // the `if (!error)` simply skipped the dispatch. The rename quietly did
        // nothing - no toast, no Sentry, and the old name still on screen.
        const renamed = await runWrite(
          supabase.from("boards").update({ name: newName }).eq("id", board.id),
          "Failed to rename board",
          { table: "boards", operation: "update" }
        );
        if (!renamed) return;

        dispatch({
          type: "UPDATE_BOARD",
          payload: { ...board, name: newName },
        });
        getQueryClient().invalidateQueries({ queryKey: queryKeys.boards() });
        notifyTabSyncBoards();
      }
    },
    [dispatch, requestPrompt]
  );

  const deleteBoard = useCallback(
    async (board: Board) => {
      if (
        confirm(
          `Are you sure you want to delete board "${board.name}"?`
        )
      ) {
        const deleted = await runWrite(
          supabase.from("boards").delete().eq("id", board.id),
          "Failed to delete board",
          { table: "boards", operation: "delete" }
        );
        if (!deleted) return;

        dispatch({ type: "REMOVE_BOARD", payload: board.id });
        getQueryClient().invalidateQueries({ queryKey: queryKeys.boards() });
        notifyTabSyncBoards();
      }
    },
    [dispatch]
  );

  const updateBoardItemNameColumn = useCallback(
    async (board: Board, newName: string) => {
      if (newName) {
        // Optimistic update
        dispatch({
          type: "UPDATE_BOARD",
          payload: { ...board, item_name_column: newName },
        });
        try {
          const { error } = await supabase
            .from("boards")
            .update({ item_name_column: newName })
            .eq("id", board.id);
          if (error) throw error;
          getQueryClient().invalidateQueries({
            queryKey: queryKeys.boards(),
          });
          notifyTabSyncBoards();
        } catch (err) {
          reportMutationError(err, "Failed to update column name", {
            table: "boards",
            operation: "update",
          });
          dispatch({ type: "UPDATE_BOARD", payload: board }); // Revert
        }
      }
    },
    [dispatch]
  );

  return {
    switchBoard,
    createBoard,
    renameBoard,
    deleteBoard,
    updateBoardItemNameColumn,
  };
}
