import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Workspace, Profile } from "@/types";
import type { BoardStoreDispatch } from "./types";
import { reportMutationError } from "@/lib/errorReporting";
import { getQueryClient } from "@/components/QueryProvider";
import { queryKeys } from "@/hooks/queries/queryKeys";

interface UseWorkspaceMutationsProps {
  dispatch: BoardStoreDispatch;
  requestPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
}

export function useWorkspaceMutations({
  dispatch,
  requestPrompt,
}: UseWorkspaceMutationsProps) {
  const createWorkspace = useCallback(
    async (currentProfile?: Profile | null) => {
      if (currentProfile?.role !== "admin") {
        alert("Only Administrators can create workspaces.");
        return;
      }

      const name = await requestPrompt("New Workspace Name:");
      if (name) {
        const isPrivate = window.confirm(
          "Do you want to make this workspace completely PRIVATE? \n\n(If yes, other admins will NOT be able to see it unless you explicitly invite them)."
        );

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
        if (data) {
          dispatch({ type: "ADD_WORKSPACE", payload: data });
          dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: data });
          getQueryClient().invalidateQueries({
            queryKey: queryKeys.workspaces(),
          });
        }
      }
    },
    [dispatch, requestPrompt]
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
