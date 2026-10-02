import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { runWrite } from "@/lib/errorReporting";
import { queryKeys } from "./queryKeys";

/**
 * The signed-in person's pinned workspaces (workspace_pins, private to them).
 * Toggling updates the list at once and puts it back if the save fails.
 */
export function useWorkspacePins(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = queryKeys.workspacePins();

  const { data: pinnedIds = [] } = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("workspace_pins").select("workspace_id");
      if (error) throw error;
      return (data ?? []).map((r) => r.workspace_id as string);
    },
  });

  const togglePin = useCallback(
    async (workspaceId: string) => {
      if (!userId) return;
      const before = queryClient.getQueryData<string[]>(key) ?? [];
      const pinned = before.includes(workspaceId);
      queryClient.setQueryData<string[]>(key, pinned ? before.filter((id) => id !== workspaceId) : [...before, workspaceId]);
      const ok = pinned
        ? await runWrite(
            supabase.from("workspace_pins").delete().eq("user_id", userId).eq("workspace_id", workspaceId),
            "Could not unpin the workspace",
            { table: "workspace_pins", operation: "delete" }
          )
        : await runWrite(
            supabase.from("workspace_pins").insert({ user_id: userId, workspace_id: workspaceId }),
            "Could not pin the workspace",
            { table: "workspace_pins", operation: "insert" }
          );
      if (!ok) queryClient.setQueryData<string[]>(key, before);
    },
    // key is a fresh tuple each render; its contents never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, userId]
  );

  return { pinnedIds, togglePin };
}
