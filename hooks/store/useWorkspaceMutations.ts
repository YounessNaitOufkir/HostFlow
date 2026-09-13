import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Workspace, Profile } from "@/types";
import type { BoardStoreDispatch } from "./types";
import { reportMutationError } from "@/lib/errorReporting";
import { getQueryClient } from "@/components/QueryProvider";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { notifyTabSyncWorkspaces } from "@/hooks/useRealtimeSync";
import { useT } from "@/components/LanguageProvider";
import { buildBoardFromTemplate, getTemplate, type TemplateId } from "@/lib/boardTemplates";
import type { StartWith } from "@/components/WorkspaceDialog";

interface UseWorkspaceMutationsProps {
  dispatch: BoardStoreDispatch;
  requestPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
  requestWorkspace: (opts: {
    canCreateShared: boolean;
  }) => Promise<{ name: string; isPrivate: boolean; startWith: StartWith } | null>;
  /** Opens the CSV/Excel import flow, once a workspace exists for it to import into. */
  onNeedsImport?: () => void;
}

export function useWorkspaceMutations({
  dispatch,
  requestPrompt,
  requestWorkspace,
  onNeedsImport,
}: UseWorkspaceMutationsProps) {
  const t = useT();

  /**
   * Builds the workspace's first board from the chosen template.
   *
   * Written in dependency order — board, then groups, then items — because each
   * row references the one before it. Groups and items go in as single batched
   * inserts rather than a loop: a template is up to seven rows, and seven
   * sequential round trips is a visible pause on the one screen where the app
   * is making its first impression.
   */
  const createFirstBoard = useCallback(
    async (workspaceId: string, boardName: string, templateId: TemplateId) => {
      const template = getTemplate(templateId);
      const built = buildBoardFromTemplate(template, t);

      const { data: board, error: boardError } = await supabase
        .from("boards")
        .insert({
          name: boardName,
          description: t(template.descKey),
          workspace_id: workspaceId,
          columns: built.columns,
        })
        .select()
        .single();

      if (boardError || !board) {
        reportMutationError(boardError, "Workspace created, but its first board could not be added", {
          table: "boards",
          operation: "insert",
        });
        return;
      }

      const { error: groupError } = await supabase.from("groups").insert(
        built.groups.map((group) => ({ ...group, board_id: board.id }))
      );
      if (groupError) {
        reportMutationError(groupError, "Board created, but its groups could not be added", {
          table: "groups",
          operation: "insert",
        });
        return;
      }

      if (built.items.length > 0) {
        const { error: itemError } = await supabase.from("items").insert(
          built.items.map((item) => ({
            id: item.id,
            board_id: board.id,
            group_id: item.groupId,
            name: item.name,
            position: item.position,
            column_values: item.column_values,
          }))
        );
        if (itemError) {
          reportMutationError(itemError, "Board created, but its example rows could not be added", {
            table: "items",
            operation: "insert",
          });
        }
      }

      dispatch({ type: "ADD_BOARD", payload: board });
      dispatch({ type: "SET_ACTIVE_BOARD", payload: board });
      dispatch({ type: "SET_GROUPS", payload: [] });
      dispatch({ type: "SET_ITEMS", payload: [] });
      dispatch({ type: "SET_MAIN_VIEW", payload: "board" });
      getQueryClient().invalidateQueries({ queryKey: queryKeys.boards() });
    },
    [dispatch, t]
  );

  const createWorkspace = useCallback(
    async (currentProfile?: Profile | null) => {
      // Anyone may create a workspace, but only a private one. That is not a
      // UI convention: the "Workspaces: Insert" policy is
      //   created_by = auth.uid() AND (is_private OR is_company_staff())
      // so the database refuses a shared workspace from a non-staff account
      // regardless of what the client sends. Offering the Shared option to
      // someone who cannot use it would just produce a silent RLS rejection,
      // so the dialog hides it instead.
      const canCreateShared = !!currentProfile?.is_staff;

      // Name and visibility now come from one dialog. The old flow asked the
      // name in a styled prompt and then the visibility in a native confirm,
      // whose Cancel only meant 'not private' - the workspace was created
      // either way, so declining produced a shared workspace rather than none.
      const draft = await requestWorkspace({ canCreateShared });
      if (!draft) return;
      const { name, isPrivate, startWith } = draft;

      const { data, error } = await supabase
        .from("workspaces")
        .insert({ name, is_private: isPrivate })
        .select()
        .single();
      if (error) {
        reportMutationError(error, "Failed to create workspace", {
          table: "workspaces",
          operation: "insert",
        });
      }
      if (!data) return;

      dispatch({ type: "ADD_WORKSPACE", payload: data });
      dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: data });
      getQueryClient().invalidateQueries({ queryKey: queryKeys.workspaces() });
      notifyTabSyncWorkspaces();

      if (startWith.kind === "import") {
        // No board yet: the workspace overview is a fine landing spot, and the
        // import flow (which asks its own "new board or existing board?"
        // question) picks up from there.
        dispatch({ type: "SET_MAIN_VIEW", payload: "workspace_overview" });
        onNeedsImport?.();
        return;
      }

      // A workspace with nothing in it is the dead end this whole flow exists to
      // remove, so the first board is built in the same action. A failure here
      // is reported but not rolled back: the workspace is real and usable, and
      // deleting it to undo a missing board would be the worse outcome.
      await createFirstBoard(data.id, name, startWith.templateId);
    },
    [dispatch, requestWorkspace, createFirstBoard, onNeedsImport]
  );

  const renameWorkspace = useCallback(
    async (ws: Workspace) => {
      const newName = await requestPrompt(
        "Enter new workspace name:",
        ws.name
      );
      if (newName && newName !== ws.name) {
        try {
          // Same reason as deleteWorkspace: an UPDATE blocked by RLS returns no
          // error and changes nothing, so the rename has to be confirmed by the
          // rows actually returned.
          const { data, error } = await supabase
            .from("workspaces")
            .update({ name: newName })
            .eq("id", ws.id)
            .select("id");
          if (error) throw error;
          if (!data || data.length === 0) {
            throw new Error(
              `"${ws.name}" was not renamed. Only the person who created a private workspace can rename it.`
            );
          }
          dispatch({
            type: "UPDATE_WORKSPACE",
            payload: { ...ws, name: newName },
          });
          getQueryClient().invalidateQueries({
            queryKey: queryKeys.workspaces(),
          });
          notifyTabSyncWorkspaces();
        } catch (err) {
          reportMutationError(err, "Failed to rename workspace", {
            table: "workspaces",
            operation: "update",
          });
        }
      }
    },
    [dispatch, requestPrompt]
  );

  const deleteWorkspace = useCallback(
    async (ws: Workspace) => {
      if (
        confirm(
          `Are you sure you want to delete workspace "${ws.name}"?`
        )
      ) {
        try {
          // .select() matters here: a DELETE that row-level security blocks
          // returns NO error and removes nothing, because Postgres filters
          // non-matching rows via USING rather than raising. Checking `error`
          // alone therefore reports success, the workspace vanishes from this
          // user's sidebar, and it is still there for everyone else and after a
          // reload.
          const { data, error } = await supabase
            .from("workspaces")
            .delete()
            .eq("id", ws.id)
            .select("id");
          if (error) throw error;
          if (!data || data.length === 0) {
            throw new Error(
              `"${ws.name}" was not deleted. Only the person who created a private workspace can delete it.`
            );
          }
          dispatch({ type: "REMOVE_WORKSPACE", payload: ws.id });
          getQueryClient().invalidateQueries({
            queryKey: queryKeys.workspaces(),
          });
          notifyTabSyncWorkspaces();
        } catch (err) {
          reportMutationError(err, "Failed to delete workspace", {
            table: "workspaces",
            operation: "delete",
          });
        }
      }
    },
    [dispatch]
  );

  return {
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
  };
}
