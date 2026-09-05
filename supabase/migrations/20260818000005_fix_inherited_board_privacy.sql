-- =================================================================================
-- Fix: people invited to a private workspace could not see its boards
-- =================================================================================
--
-- can_access_board() fell back to workspace access only when the board was not
-- private, using the INHERITED value:
--
--     OR (public.board_is_private(b.id) = false
--         AND public.can_access_workspace(b.workspace_id))
--
-- board_is_private() resolves COALESCE(board.is_private, workspace.is_private,
-- false). So every board inside a private workspace inherited `true`, the
-- fallback was skipped, and access collapsed to "creator or explicit board
-- grant". Inviting somebody to a private workspace let them see the workspace
-- shell and nothing inside it, which makes the invite feature useless.
--
-- The inherited value is the wrong input for this test. A board that merely sits
-- in a private workspace is not creator-only: it is exactly as private as its
-- workspace, and can_access_workspace() already enforces that. Only an EXPLICIT
-- board-level override should cut off workspace members -- that is the
-- "Communication but not Lancement in the same workspace" case.
--
-- Verified against live data before and after, evaluating both rules per board
-- as the invited user:
--
--   board                 workspace      ws_private  current  corrected
--   Communication         App C          false       true     true
--   Marketing             App C          false       true     true
--   General Tasks         General tasks  false       true     true
--   Shared Import Test    My Workspace   true        FALSE    TRUE   <- invited
--   This is a test board  Test workspace true        false    false  <- not invited
--
-- The correction opens exactly the invited board and nothing else.
--
-- board_is_private() is unchanged and still correct for display: a board in a
-- private workspace should show a lock.
-- =================================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_board(b_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boards b
     WHERE b.id = b_id
       AND (
            b.created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.board_members bm
                     WHERE bm.board_id = b.id AND bm.user_id = auth.uid())
         -- Only an explicit board-level private blocks workspace inheritance.
         -- The workspace's own privacy is enforced by can_access_workspace().
         OR (COALESCE(b.is_private, false) = false
             AND public.can_access_workspace(b.workspace_id))
       )
  );
$$;

-- can_manage_board() delegates to can_manage_workspace() and never consulted the
-- inherited value, so it needs no change.

COMMIT;
