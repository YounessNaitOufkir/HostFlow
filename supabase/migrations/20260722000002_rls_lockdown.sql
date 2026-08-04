-- =================================================================================
-- HostFlow: RLS Lockdown and Security Enhancements
-- =================================================================================

-- 1. Helper Functions for RLS
-- =================================================================================

-- Check if user is a member of a workspace
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has admin/manager role in a workspace
CREATE OR REPLACE FUNCTION is_workspace_manager_or_admin(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role IN ('admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is an admin globally (from profiles)
CREATE OR REPLACE FUNCTION is_global_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is a member of a board's workspace
CREATE OR REPLACE FUNCTION is_board_member(b_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  ws_id UUID;
BEGIN
  SELECT workspace_id INTO ws_id FROM boards WHERE id = b_id;
  RETURN is_workspace_member(ws_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is a member of BOTH items' boards (for cross-board links)
CREATE OR REPLACE FUNCTION is_member_of_both_items(source_id UUID, target_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  source_ws_id UUID;
  target_ws_id UUID;
BEGIN
  SELECT b.workspace_id INTO source_ws_id FROM items i JOIN boards b ON i.board_id = b.id WHERE i.id = source_id;
  SELECT b.workspace_id INTO target_ws_id FROM items i JOIN boards b ON i.board_id = b.id WHERE i.id = target_id;
  RETURN is_workspace_member(source_ws_id) AND is_workspace_member(target_ws_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop the old MVP policies
-- =================================================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['workspaces','profiles','boards','groups','items','item_links','automations','notifications','activity_logs'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_auth_all" ON %1$s;', tbl);
  END LOOP;
END $$;

-- 3. Apply Strict RLS Policies
-- =================================================================================

-- workspaces
CREATE POLICY "Workspaces: Select" ON workspaces FOR SELECT TO authenticated USING (is_workspace_member(id) OR is_global_admin());
CREATE POLICY "Workspaces: Insert" ON workspaces FOR INSERT TO authenticated WITH CHECK (is_global_admin());
CREATE POLICY "Workspaces: Update" ON workspaces FOR UPDATE TO authenticated USING (is_workspace_manager_or_admin(id) OR is_global_admin());
CREATE POLICY "Workspaces: Delete" ON workspaces FOR DELETE TO authenticated USING (is_workspace_manager_or_admin(id) OR is_global_admin());

-- boards
CREATE POLICY "Boards: Select" ON boards FOR SELECT TO authenticated USING (is_workspace_member(workspace_id) OR is_global_admin());
CREATE POLICY "Boards: Insert" ON boards FOR INSERT TO authenticated WITH CHECK (is_workspace_manager_or_admin(workspace_id) OR is_global_admin());
CREATE POLICY "Boards: Update" ON boards FOR UPDATE TO authenticated USING (is_workspace_manager_or_admin(workspace_id) OR is_global_admin());
CREATE POLICY "Boards: Delete" ON boards FOR DELETE TO authenticated USING (is_workspace_manager_or_admin(workspace_id) OR is_global_admin());

-- groups
CREATE POLICY "Groups: Select" ON groups FOR SELECT TO authenticated USING (is_board_member(board_id) OR is_global_admin());
CREATE POLICY "Groups: Insert" ON groups FOR INSERT TO authenticated WITH CHECK (is_board_member(board_id) OR is_global_admin());
CREATE POLICY "Groups: Update" ON groups FOR UPDATE TO authenticated USING (is_board_member(board_id) OR is_global_admin());
CREATE POLICY "Groups: Delete" ON groups FOR DELETE TO authenticated USING (
  is_global_admin() OR (SELECT is_workspace_manager_or_admin(workspace_id) FROM boards WHERE id = board_id)
);

-- items
CREATE POLICY "Items: Select" ON items FOR SELECT TO authenticated USING (is_board_member(board_id) OR is_global_admin());
CREATE POLICY "Items: Insert" ON items FOR INSERT TO authenticated WITH CHECK (is_board_member(board_id) OR is_global_admin());
CREATE POLICY "Items: Update" ON items FOR UPDATE TO authenticated USING (is_board_member(board_id) OR is_global_admin());
CREATE POLICY "Items: Delete" ON items FOR DELETE TO authenticated USING (
  is_global_admin() OR (SELECT is_workspace_manager_or_admin(workspace_id) FROM boards WHERE id = board_id)
);

-- item_links
CREATE POLICY "ItemLinks: Select" ON item_links FOR SELECT TO authenticated USING (is_member_of_both_items(source_item_id, target_item_id) OR is_global_admin());
CREATE POLICY "ItemLinks: Insert" ON item_links FOR INSERT TO authenticated WITH CHECK (is_member_of_both_items(source_item_id, target_item_id) OR is_global_admin());
CREATE POLICY "ItemLinks: Update" ON item_links FOR UPDATE TO authenticated USING (is_member_of_both_items(source_item_id, target_item_id) OR is_global_admin());
CREATE POLICY "ItemLinks: Delete" ON item_links FOR DELETE TO authenticated USING (is_member_of_both_items(source_item_id, target_item_id) OR is_global_admin());

-- profiles
CREATE POLICY "Profiles: Select" ON profiles FOR SELECT TO authenticated USING (true); -- Public read for mentions/assignments
CREATE POLICY "Profiles: Update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id); -- Only update own profile

-- activity_logs
CREATE POLICY "ActivityLogs: Select" ON activity_logs FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_global_admin());
CREATE POLICY "ActivityLogs: Insert" ON activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- notifications
CREATE POLICY "Notifications: Select" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Notifications: Update" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Notifications: Delete" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 4. Secure Admin Function
-- =================================================================================
CREATE OR REPLACE FUNCTION invite_admin(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Explicit internal check: Only global admins can elevate others to admin
  IF NOT is_global_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can perform this action.';
  END IF;

  UPDATE profiles SET role = 'admin' WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
