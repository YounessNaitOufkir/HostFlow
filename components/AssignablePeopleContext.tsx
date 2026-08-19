"use client";

import { createContext, useContext } from "react";

/**
 * Who may be newly assigned to work in the current workspace.
 *
 * A shared workspace is staff-only — can_access_workspace refuses external
 * people outright — so offering them in an assignee picker there means handing
 * someone a task they cannot open. `null` means no restriction, which is the
 * case on a private workspace, where an external person can legitimately be
 * invited and therefore assigned.
 *
 * This is a context rather than a prop because the profile list is passed to a
 * dozen components; only the pickers need the restricted view, and they should
 * still show people already assigned so those can be removed.
 */
export const AssignablePeopleContext = createContext<Set<string> | null>(null);

export function useAssignablePeople() {
  return useContext(AssignablePeopleContext);
}
