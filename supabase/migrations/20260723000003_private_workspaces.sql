-- Migration: Private Workspaces

-- 1. Add is_private column to workspaces
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;

-- 2. Create helper function for conditional admin access
CREATE OR REPLACE FUNCTION is_admin_allowed_in_workspace(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- An admin is allowed IF they are a global admin AND the workspace is NOT private.
  -- If it IS private, this function returns false, meaning the admin will only get access
  -- if they pass the regular membership checks (is_workspace_member, etc.)
  RETURN is_global_admin() AND NOT EXISTS (
    SELECT 1 FROM workspaces WHERE id = ws_id AND is_private = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update RLS Policies to use the new conditional admin check

-- WORKSPACES
DROP POLICY IF EXISTS "Workspaces: Select" ON workspaces;
CREATE POLICY "Workspaces: Select" ON workspaces FOR SELECT TO authenticated USING (
  is_workspace_member(id) OR has_any_board_in_workspace(id) OR is_admin_allowed_in_workspace(id)
);

DROP POLICY IF EXISTS "Workspaces: Update" ON workspaces;
CREATE POLICY "Workspaces: Update" ON workspaces FOR UPDATE TO authenticated USING (
  is_workspace_manager_or_admin(id) OR is_admin_allowed_in_workspace(id)
);

DROP POLICY IF EXISTS "Workspaces: Delete" ON workspaces;
CREATE POLICY "Workspaces: Delete" ON workspaces FOR DELETE TO authenticated USING (
  is_workspace_manager_or_admin(id) OR is_admin_allowed_in_workspace(id)
);

-- BOARDS
DROP POLICY IF EXISTS "Boards: Select" ON boards;
CREATE POLICY "Boards: Select" ON boards FOR SELECT TO authenticated USING (
  is_workspace_member(workspace_id) OR is_board_member_explicit(id) OR is_admin_allowed_in_workspace(workspace_id)
);

DROP POLICY IF EXISTS "Boards: Insert" ON boards;
CREATE POLICY "Boards: Insert" ON boards FOR INSERT TO authenticated WITH CHECK (
  is_workspace_manager_or_admin(workspace_id) OR is_admin_allowed_in_workspace(workspace_id)
);

DROP POLICY IF EXISTS "Boards: Update" ON boards;
CREATE POLICY "Boards: Update" ON boards FOR UPDATE TO authenticated USING (
  is_workspace_manager_or_admin(workspace_id) OR is_admin_allowed_in_workspace(workspace_id)
);

DROP POLICY IF EXISTS "Boards: Delete" ON boards;
CREATE POLICY "Boards: Delete" ON boards FOR DELETE TO authenticated USING (
  is_workspace_manager_or_admin(workspace_id) OR is_admin_allowed_in_workspace(workspace_id)
);

-- GROUPS
DROP POLICY IF EXISTS "Groups: Select" ON groups;
CREATE POLICY "Groups: Select" ON groups FOR SELECT TO authenticated USING (
  is_board_member(board_id) OR is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = board_id))
);

DROP POLICY IF EXISTS "Groups: Insert" ON groups;
CREATE POLICY "Groups: Insert" ON groups FOR INSERT TO authenticated WITH CHECK (
  is_board_member(board_id) OR is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = board_id))
);

DROP POLICY IF EXISTS "Groups: Update" ON groups;
CREATE POLICY "Groups: Update" ON groups FOR UPDATE TO authenticated USING (
  is_board_member(board_id) OR is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = board_id))
);

DROP POLICY IF EXISTS "Groups: Delete" ON groups;
CREATE POLICY "Groups: Delete" ON groups FOR DELETE TO authenticated USING (
  is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = board_id)) OR 
  (SELECT is_workspace_manager_or_admin(workspace_id) FROM boards WHERE id = board_id)
);

-- ITEMS
DROP POLICY IF EXISTS "Items: Select" ON items;
CREATE POLICY "Items: Select" ON items FOR SELECT TO authenticated USING (
  is_board_member(board_id) OR is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = board_id))
);

DROP POLICY IF EXISTS "Items: Insert" ON items;
CREATE POLICY "Items: Insert" ON items FOR INSERT TO authenticated WITH CHECK (
  is_board_member(board_id) OR is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = board_id))
);

DROP POLICY IF EXISTS "Items: Update" ON items;
CREATE POLICY "Items: Update" ON items FOR UPDATE TO authenticated USING (
  is_board_member(board_id) OR is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = board_id))
);

DROP POLICY IF EXISTS "Items: Delete" ON items;
CREATE POLICY "Items: Delete" ON items FOR DELETE TO authenticated USING (
  is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = board_id)) OR 
  (SELECT is_workspace_manager_or_admin(workspace_id) FROM boards WHERE id = board_id)
);

-- ITEM_LINKS
DROP POLICY IF EXISTS "ItemLinks: Select" ON item_links;
CREATE POLICY "ItemLinks: Select" ON item_links FOR SELECT TO authenticated USING (
  is_member_of_both_items(source_item_id, target_item_id) OR 
  is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = (SELECT board_id FROM items WHERE id = source_item_id)))
);

DROP POLICY IF EXISTS "ItemLinks: Insert" ON item_links;
CREATE POLICY "ItemLinks: Insert" ON item_links FOR INSERT TO authenticated WITH CHECK (
  is_member_of_both_items(source_item_id, target_item_id) OR 
  is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = (SELECT board_id FROM items WHERE id = source_item_id)))
);

DROP POLICY IF EXISTS "ItemLinks: Update" ON item_links;
CREATE POLICY "ItemLinks: Update" ON item_links FOR UPDATE TO authenticated USING (
  is_member_of_both_items(source_item_id, target_item_id) OR 
  is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = (SELECT board_id FROM items WHERE id = source_item_id)))
);

DROP POLICY IF EXISTS "ItemLinks: Delete" ON item_links;
CREATE POLICY "ItemLinks: Delete" ON item_links FOR DELETE TO authenticated USING (
  is_member_of_both_items(source_item_id, target_item_id) OR 
  is_admin_allowed_in_workspace((SELECT workspace_id FROM boards WHERE id = (SELECT board_id FROM items WHERE id = source_item_id)))
);
