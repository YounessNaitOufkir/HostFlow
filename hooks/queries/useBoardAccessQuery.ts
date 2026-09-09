"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./queryKeys";

export interface BoardAccessQueryResult {
  boardMemberIds: Set<string>;
  /** user_id -> role, for the board's workspace. */
  workspaceMemberRoles: Map<string, string>;
}

/**
 * Who can actually reach a board, at the membership-row level.
 *
 * RLS lets anyone who can already access the board read both of these lists
 * in full (`BoardMembers: Select` / `WorkspaceMembers: Select`), so this is
 * one cheap query per board open, not a per-person check.
 */
export function useBoardAccessQuery(boardId: string | null, workspaceId: string | null | undefined) {
  return useQuery<BoardAccessQueryResult>({
    queryKey: queryKeys.boardAccess(boardId || ""),
    queryFn: async () => {
      if (!boardId) return { boardMemberIds: new Set(), workspaceMemberRoles: new Map() };

      const [boardMembersRes, workspaceMembersRes] = await Promise.all([
        supabase.from("board_members").select("user_id").eq("board_id", boardId),
        workspaceId
          ? supabase.from("workspace_members").select("user_id, role").eq("workspace_id", workspaceId)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (boardMembersRes.error) throw boardMembersRes.error;
      if (workspaceMembersRes.error) throw workspaceMembersRes.error;

      return {
        boardMemberIds: new Set((boardMembersRes.data || []).map((r: { user_id: string }) => r.user_id)),
        workspaceMemberRoles: new Map(
          (workspaceMembersRes.data || []).map((r: { user_id: string; role: string | null }) => [
            r.user_id,
            r.role || "member",
          ])
        ),
      };
    },
    enabled: Boolean(boardId),
  });
}
