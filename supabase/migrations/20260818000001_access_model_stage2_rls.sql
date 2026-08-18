-- =================================================================================
-- Access model, stage 2: RLS rebuild
-- =================================================================================
--
-- Implements ACCESS_MODEL.md for workspaces, boards, groups, items and item_links.
-- Profiles and the signup flow follow in stage 3.
--
-- Two things are done deliberately:
--
--   1. The legacy predicates (is_workspace_member, is_board_member,
--      is_workspace_manager_or_admin) are REDEFINED to delegate to the new
--      privacy-aware ones. Policies on tables not rewritten here — updates,
--      automations, activity_logs and so on — therefore inherit the correct
--      behaviour instead of silently granting access to private content.
--
--   2. Policies are still rewritten explicitly rather than relying only on that
--      redefinition, because two of the old expressions were structurally wrong:
--      "Boards: Select" granted every workspace member access to every board in
--      the workspace, and the groups/items policies OR'd in a workspace-level
--      admin check that ignored board privacy.
--
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Core predicates
-- ---------------------------------------------------------------------------

-- Access to a workspace itself: its creator, an explicit member, or an admin
-- when the workspace is not private. Admins never reach private workspaces.
CREATE OR REPLACE FUNCTION public.can_access_workspace(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
     WHERE w.id = ws_id
       AND (
            w.created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.workspace_members m
                     WHERE m.workspace_id = w.id AND m.user_id = auth.uid())
         OR (COALESCE(w.is_private, false) = false AND public.is_global_admin())
       )
  );
$$;

-- Whether the workspace should appear in the sidebar at all. Someone granted a
-- single board needs to see its workspace to navigate to it, but that must NOT
-- imply access to the workspace's other boards -- see can_access_board.
CREATE OR REPLACE FUNCTION public.can_see_workspace_shell(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.can_access_workspace(ws_id)
      OR EXISTS (
           SELECT 1
             FROM public.board_members bm
             JOIN public.boards b ON b.id = bm.board_id
            WHERE b.workspace_id = ws_id AND bm.user_id = auth.uid()
         );
$$;

-- Access to a board: its creator, an explicit board grant, or -- only when the
-- board is not private -- access to its workspace.
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
         OR (public.board_is_private(b.id) = false
             AND public.can_access_workspace(b.workspace_id))
       )
  );
$$;

-- Structural changes to a workspace.
CREATE OR REPLACE FUNCTION public.can_manage_workspace(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
     WHERE w.id = ws_id
       AND (
            w.created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.workspace_members m
                     WHERE m.workspace_id = w.id AND m.user_id = auth.uid()
                       AND m.role IN ('admin', 'manager'))
         OR (COALESCE(w.is_private, false) = false AND public.is_global_admin())
       )
  );
$$;

-- Structural changes to a board.
CREATE OR REPLACE FUNCTION public.can_manage_board(b_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boards b
     WHERE b.id = b_id
       AND (
            b.created_by = auth.uid()
         OR public.can_manage_workspace(b.workspace_id)
       )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_workspace(UUID)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_see_workspace_shell(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_board(UUID)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_workspace(UUID)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_board(UUID)        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_access_workspace(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_workspace_shell(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_board(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_board(UUID)        TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Legacy predicates now delegate, so unseen policies stay correct
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.can_access_workspace(ws_id); $$;

CREATE OR REPLACE FUNCTION public.is_board_member(b_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.can_access_board(b_id); $$;

CREATE OR REPLACE FUNCTION public.is_workspace_manager_or_admin(ws_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.can_manage_workspace(ws_id); $$;

-- ---------------------------------------------------------------------------
-- 3. Workspaces
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Workspaces: Select" ON public.workspaces;
DROP POLICY IF EXISTS "Workspaces: Insert" ON public.workspaces;
DROP POLICY IF EXISTS "Workspaces: Update" ON public.workspaces;
DROP POLICY IF EXISTS "Workspaces: Delete" ON public.workspaces;

CREATE POLICY "Workspaces: Select" ON public.workspaces
  FOR SELECT TO authenticated
  USING (public.can_see_workspace_shell(id));

-- Previously required is_global_admin(), so no ordinary user could create a
-- workspace at all -- including their own personal one.
CREATE POLICY "Workspaces: Insert" ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Workspaces: Update" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (public.can_manage_workspace(id))
  WITH CHECK (public.can_manage_workspace(id));

CREATE POLICY "Workspaces: Delete" ON public.workspaces
  FOR DELETE TO authenticated
  USING (public.can_manage_workspace(id));

-- ---------------------------------------------------------------------------
-- 4. Boards
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Boards: Select" ON public.boards;
DROP POLICY IF EXISTS "Boards: Insert" ON public.boards;
DROP POLICY IF EXISTS "Boards: Update" ON public.boards;
DROP POLICY IF EXISTS "Boards: Delete" ON public.boards;

CREATE POLICY "Boards: Select" ON public.boards
  FOR SELECT TO authenticated
  USING (public.can_access_board(id));

CREATE POLICY "Boards: Insert" ON public.boards
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_manage_workspace(workspace_id));

CREATE POLICY "Boards: Update" ON public.boards
  FOR UPDATE TO authenticated
  USING (public.can_manage_board(id))
  WITH CHECK (public.can_manage_board(id));

CREATE POLICY "Boards: Delete" ON public.boards
  FOR DELETE TO authenticated
  USING (public.can_manage_board(id));

-- ---------------------------------------------------------------------------
-- 5. Groups, items, item_links -- all gated on board access
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Groups: Select" ON public.groups;
DROP POLICY IF EXISTS "Groups: Insert" ON public.groups;
DROP POLICY IF EXISTS "Groups: Update" ON public.groups;
DROP POLICY IF EXISTS "Groups: Delete" ON public.groups;

CREATE POLICY "Groups: Select" ON public.groups
  FOR SELECT TO authenticated USING (public.can_access_board(board_id));
CREATE POLICY "Groups: Insert" ON public.groups
  FOR INSERT TO authenticated WITH CHECK (public.can_access_board(board_id));
CREATE POLICY "Groups: Update" ON public.groups
  FOR UPDATE TO authenticated
  USING (public.can_access_board(board_id))
  WITH CHECK (public.can_access_board(board_id));
CREATE POLICY "Groups: Delete" ON public.groups
  FOR DELETE TO authenticated USING (public.can_manage_board(board_id));

DROP POLICY IF EXISTS "Items: Select" ON public.items;
DROP POLICY IF EXISTS "Items: Insert" ON public.items;
DROP POLICY IF EXISTS "Items: Update" ON public.items;
DROP POLICY IF EXISTS "Items: Delete" ON public.items;

CREATE POLICY "Items: Select" ON public.items
  FOR SELECT TO authenticated USING (public.can_access_board(board_id));
CREATE POLICY "Items: Insert" ON public.items
  FOR INSERT TO authenticated WITH CHECK (public.can_access_board(board_id));
CREATE POLICY "Items: Update" ON public.items
  FOR UPDATE TO authenticated
  USING (public.can_access_board(board_id))
  WITH CHECK (public.can_access_board(board_id));
-- Deleting an item is a soft delete performed via UPDATE; hard DELETE stays
-- restricted to those who can manage the board.
CREATE POLICY "Items: Delete" ON public.items
  FOR DELETE TO authenticated USING (public.can_manage_board(board_id));

DROP POLICY IF EXISTS "ItemLinks: Select" ON public.item_links;
DROP POLICY IF EXISTS "ItemLinks: Insert" ON public.item_links;
DROP POLICY IF EXISTS "ItemLinks: Update" ON public.item_links;
DROP POLICY IF EXISTS "ItemLinks: Delete" ON public.item_links;

CREATE POLICY "ItemLinks: Select" ON public.item_links
  FOR SELECT TO authenticated
  USING (public.is_member_of_both_items(source_item_id, target_item_id));
CREATE POLICY "ItemLinks: Insert" ON public.item_links
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of_both_items(source_item_id, target_item_id));
CREATE POLICY "ItemLinks: Update" ON public.item_links
  FOR UPDATE TO authenticated
  USING (public.is_member_of_both_items(source_item_id, target_item_id))
  WITH CHECK (public.is_member_of_both_items(source_item_id, target_item_id));
CREATE POLICY "ItemLinks: Delete" ON public.item_links
  FOR DELETE TO authenticated
  USING (public.is_member_of_both_items(source_item_id, target_item_id));

-- ---------------------------------------------------------------------------
-- 6. Default created_by, so the INSERT policies above are satisfiable without
--    the client having to remember to set it
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_created_by()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_created_by() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workspaces_set_created_by ON public.workspaces;
CREATE TRIGGER workspaces_set_created_by
  BEFORE INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

DROP TRIGGER IF EXISTS boards_set_created_by ON public.boards;
CREATE TRIGGER boards_set_created_by
  BEFORE INSERT ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

-- ---------------------------------------------------------------------------
-- 7. handle_new_workspace: make it null-safe
--
-- It inserts workspace_members(auth.uid(), ...), which violates the NOT NULL on
-- user_id whenever a workspace is created outside a user session -- a service
-- role script, or the signup trigger added in stage 3. That would abort the
-- insert, which is the same failure mode that broke signup for three weeks.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  creator UUID := COALESCE(auth.uid(), NEW.created_by);
BEGIN
  IF creator IS NOT NULL THEN
    INSERT INTO public.workspace_members (user_id, workspace_id, role)
    VALUES (creator, NEW.id, 'admin'::user_role)
    ON CONFLICT (user_id, workspace_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
