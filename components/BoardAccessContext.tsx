"use client";

import { createContext, useContext } from "react";

export interface BoardAccessValue {
  /** Does this profile actually have access to the current board? Advisory
   * only — see lib/boardAccess.ts. */
  hasAccess: (userId: string) => boolean;
  /** Can the signed-in user grant board access at all? Gates whether the
   * assignee guard's "Grant Access" action is offered. */
  canGrant: boolean;
  /** Inserts a board_members row for userId on the current board. */
  grant: (userId: string) => Promise<boolean>;
  /** Every profile explicitly granted access to the active board's workspace,
   * keyed by user id. Used on private workspaces to widen the picker beyond
   * "just yourself" to everyone actually invited there. */
  workspaceMemberRoles: Map<string, string>;
}

/**
 * Whether a candidate assignee can actually reach the board being edited.
 *
 * A context for the same reason AssignablePeopleContext is one: this is
 * needed only by the People picker, several layers below where the board and
 * its membership data live, and computing it per-cell instead of once per
 * board would mean a fresh board_members/workspace_members read on every
 * render.
 *
 * On shared workspaces, hasAccess/canGrant/grant drive the assignee guard.
 * On private workspaces the picker instead widens to workspaceMemberRoles,
 * since staff-by-ceiling doesn't apply there. See PeopleCell.tsx.
 */
export const BoardAccessContext = createContext<BoardAccessValue | null>(null);

export function useBoardAccess() {
  return useContext(BoardAccessContext);
}
