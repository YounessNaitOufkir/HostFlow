"use client";

import React, { useState, useCallback } from "react";
import WorkspaceDialog, { type WorkspaceDraft } from "@/components/WorkspaceDialog";

interface DialogState {
  isOpen: boolean;
  canCreateShared: boolean;
  resolve: ((value: WorkspaceDraft | null) => void) | null;
}

/**
 * Promise-based wrapper around WorkspaceDialog, mirroring usePromptModal.
 *
 * Resolves with the draft, or null when the user cancels — and cancelling here
 * really does mean "create nothing", unlike the native confirm this replaces,
 * where declining still created a shared workspace.
 */
export function useWorkspaceDialog() {
  const [state, setState] = useState<DialogState>({
    isOpen: false,
    canCreateShared: false,
    resolve: null,
  });

  const requestWorkspace = useCallback(
    (opts: { canCreateShared: boolean }): Promise<WorkspaceDraft | null> => {
      return new Promise((resolve) =>
        setState({ isOpen: true, canCreateShared: opts.canCreateShared, resolve })
      );
    },
    []
  );

  const settle = useCallback(
    (value: WorkspaceDraft | null) => {
      state.resolve?.(value);
      setState((prev) => ({ ...prev, isOpen: false }));
    },
    [state]
  );

  const WorkspaceDialogComponent = (
    <WorkspaceDialog
      isOpen={state.isOpen}
      canCreateShared={state.canCreateShared}
      onClose={() => settle(null)}
      onSubmit={(draft) => settle(draft)}
    />
  );

  return { requestWorkspace, WorkspaceDialogComponent };
}
