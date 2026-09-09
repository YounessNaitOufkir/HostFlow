import type { Board, Profile, Workspace } from "@/types";

/**
 * Client-side mirror of `can_access_board_as()` / `can_access_workspace_as()`,
 * for an arbitrary candidate profile rather than the signed-in session.
 *
 * This is advisory, not a security boundary — RLS is still the only thing
 * that actually decides what the candidate can read. Getting this wrong in
 * either direction just means the assignee guard fires when it didn't need
 * to, or misses a case; it never grants or withholds real access.
 */
export function hasBoardAccess(
  candidate: Pick<Profile, "id" | "role" | "is_staff">,
  board: Pick<Board, "id" | "created_by" | "is_private">,
  workspace: Pick<Workspace, "id" | "created_by" | "is_private"> | undefined,
  boardMemberIds: Set<string>,
  workspaceMemberRoles: Map<string, string>
): boolean {
  if (candidate.id === board.created_by) return true;
  if (boardMemberIds.has(candidate.id)) return true;
  if (!workspace) return false;
  if (candidate.id === workspace.created_by) return true;

  const effectivePrivate = board.is_private ?? workspace.is_private ?? false;
  if (workspaceMemberRoles.has(candidate.id)) return true;
  if (!effectivePrivate && candidate.role === "admin") return true;
  return false;
}

/**
 * Client-side mirror of `can_manage_board()`, for the signed-in user — decides
 * whether the "Grant Access" half of the guard should even be offered. RLS
 * (`BoardMembers: Insert`) enforces the real version of this; getting this
 * wrong only means offering a button that would then no-op under RLS.
 */
export function canGrantBoardAccess(
  currentUserId: string,
  currentProfile: Pick<Profile, "role"> | null | undefined,
  board: Pick<Board, "created_by">,
  workspace: Pick<Workspace, "created_by" | "is_private"> | undefined,
  currentUserWorkspaceRole: string | undefined
): boolean {
  if (currentUserId === board.created_by) return true;
  if (!workspace) return false;
  if (currentUserId === workspace.created_by) return true;
  if (currentUserWorkspaceRole === "admin" || currentUserWorkspaceRole === "manager") return true;
  if (!workspace.is_private && currentProfile?.role === "admin") return true;
  return false;
}
