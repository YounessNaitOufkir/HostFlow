-- =================================================================================
-- Close two membership holes, and let a private workspace's owner invite people
-- =================================================================================
--
-- 1. WorkspaceMembers/BoardMembers INSERT and DELETE were
--
--       WITH CHECK (is_global_admin() OR is_workspace_manager_or_admin(...))
--
--    The standalone is_global_admin() branch let ANY admin insert a membership
--    row for ANY workspace -- including a private one they do not own. Doing so
--    grants themselves access, which defeats the privacy promise in
--    ACCESS_MODEL.md ("Admins do not bypass this").
--
--    can_manage_workspace() already grants admins on NON-private workspaces, so
--    dropping the extra branch loses nothing legitimate and closes the bypass.
--
-- 2. Both tables had SELECT USING (true), so any signed-in user could enumerate
--    the membership of every workspace and board, private ones included.
--
-- The invite capability itself needs no new grant: can_manage_workspace() is
-- true for a workspace's creator, so the owner of a private workspace can add
-- members. That is what the UI now exposes.
--
-- No recursion risk: the predicates are SECURITY DEFINER and so bypass RLS on
-- the very tables these policies protect.
-- =================================================================================

BEGIN;

-- --- workspace_members ---------------------------------------------------

DROP POLICY IF EXISTS "WorkspaceMembers: Select" ON public.workspace_members;
DROP POLICY IF EXISTS "WorkspaceMembers: Insert" ON public.workspace_members;
DROP POLICY IF EXISTS "WorkspaceMembers: Delete" ON public.workspace_members;

CREATE POLICY "WorkspaceMembers: Select" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_see_workspace_shell(workspace_id));

CREATE POLICY "WorkspaceMembers: Insert" ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace(workspace_id));

CREATE POLICY "WorkspaceMembers: Delete" ON public.workspace_members
  FOR DELETE TO authenticated
  USING (public.can_manage_workspace(workspace_id));

-- --- board_members -------------------------------------------------------

DROP POLICY IF EXISTS "BoardMembers: Select" ON public.board_members;
DROP POLICY IF EXISTS "BoardMembers: Insert" ON public.board_members;
DROP POLICY IF EXISTS "BoardMembers: Delete" ON public.board_members;

CREATE POLICY "BoardMembers: Select" ON public.board_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_board(board_id));

CREATE POLICY "BoardMembers: Insert" ON public.board_members
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_board(board_id));

CREATE POLICY "BoardMembers: Delete" ON public.board_members
  FOR DELETE TO authenticated
  USING (public.can_manage_board(board_id));

COMMIT;
