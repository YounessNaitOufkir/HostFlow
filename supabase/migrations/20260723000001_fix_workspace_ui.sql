-- Fix workspace UI disconnects
-- 1. RLS for workspace_members
CREATE POLICY "WorkspaceMembers: Select" ON workspace_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "WorkspaceMembers: Insert" ON workspace_members FOR INSERT TO authenticated WITH CHECK (is_global_admin() OR is_workspace_manager_or_admin(workspace_id));
CREATE POLICY "WorkspaceMembers: Delete" ON workspace_members FOR DELETE TO authenticated USING (is_global_admin() OR is_workspace_manager_or_admin(workspace_id));

-- 2. Secure RPC for changing roles
CREATE OR REPLACE FUNCTION set_user_role(target_user_id UUID, new_role user_role)
RETURNS VOID AS $$
BEGIN
  IF NOT is_global_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can change roles.';
  END IF;
  UPDATE profiles SET role = new_role WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger for workspace creation
CREATE OR REPLACE FUNCTION handle_new_workspace()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspace_members (user_id, workspace_id, role)
  VALUES (auth.uid(), NEW.id, 'admin'::user_role);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_workspace_created ON workspaces;
CREATE TRIGGER on_workspace_created
  AFTER INSERT ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_workspace();
