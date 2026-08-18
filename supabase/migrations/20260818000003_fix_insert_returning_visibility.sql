-- =================================================================================
-- Fix: creating a workspace or board fails with
--      "new row violates row-level security policy"
-- =================================================================================
--
-- Introduced by 20260818000001. The SELECT policies were:
--
--   USING (public.can_see_workspace_shell(id))   -- workspaces
--   USING (public.can_access_board(id))          -- boards
--
-- Both predicates resolve access by looking the row up in the very table being
-- written. They are STABLE, so during INSERT ... RETURNING they run against the
-- statement's snapshot, which predates the new row: the lookup finds nothing,
-- the predicate returns false, and Postgres reports it as an RLS violation.
--
-- The INSERT itself was always fine. Proof:
--   INSERT ... VALUES (...)              -> succeeds
--   INSERT ... VALUES (...) RETURNING id -> fails
-- and calling the predicate in a later statement of the same transaction
-- returns true, once the row is visible.
--
-- supabase-js appends RETURNING for .select(), which every create path uses,
-- so in practice nobody could create a workspace or a board.
--
-- Fix: let the creator match on the candidate row's own column. `created_by`
-- is read directly off the row being checked, needs no self-lookup, and is
-- therefore snapshot-independent. It also short-circuits the common case
-- before the more expensive predicate runs.
-- =================================================================================

BEGIN;

DROP POLICY IF EXISTS "Workspaces: Select" ON public.workspaces;
CREATE POLICY "Workspaces: Select" ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.can_see_workspace_shell(id)
  );

DROP POLICY IF EXISTS "Boards: Select" ON public.boards;
CREATE POLICY "Boards: Select" ON public.boards
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.can_access_board(id)
  );

COMMIT;
