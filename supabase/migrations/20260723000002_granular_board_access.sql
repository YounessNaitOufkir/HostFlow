-- Migration: Granular Board Access

-- 1. Create board_members table
CREATE TABLE IF NOT EXISTS board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  role user_role DEFAULT 'member'::user_role,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, board_id)
);

CREATE INDEX IF NOT EXISTS idx_board_members_user_id ON board_members(user_id);
CREATE INDEX IF NOT EXISTS idx_board_members_board_id ON board_members(board_id);
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;

-- Board members select access
CREATE POLICY "BoardMembers: Select" ON board_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "BoardMembers: Insert" ON board_members FOR INSERT TO authenticated WITH CHECK (
  is_global_admin() OR is_workspace_manager_or_admin((SELECT workspace_id FROM boards WHERE id = board_id))
);
CREATE POLICY "BoardMembers: Delete" ON board_members FOR DELETE TO authenticated USING (
  is_global_admin() OR is_workspace_manager_or_admin((SELECT workspace_id FROM boards WHERE id = board_id))
);

-- 2. Helper functions
CREATE OR REPLACE FUNCTION is_board_member_explicit(b_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = b_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION has_any_board_in_workspace(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM board_members bm
    JOIN boards b ON bm.board_id = b.id
    WHERE b.workspace_id = ws_id AND bm.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Redefine is_board_member to include explicit board membership
CREATE OR REPLACE FUNCTION is_board_member(b_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  ws_id UUID;
BEGIN
  SELECT workspace_id INTO ws_id FROM boards WHERE id = b_id;
  RETURN is_workspace_member(ws_id) OR is_board_member_explicit(b_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update cross-board link logic to use new is_board_member function
CREATE OR REPLACE FUNCTION is_member_of_both_items(source_id UUID, target_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  source_b_id UUID;
  target_b_id UUID;
BEGIN
  SELECT board_id INTO source_b_id FROM items WHERE id = source_id;
  SELECT board_id INTO target_b_id FROM items WHERE id = target_id;
  RETURN is_board_member(source_b_id) AND is_board_member(target_b_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update RLS Policies
DROP POLICY IF EXISTS "Workspaces: Select" ON workspaces;
CREATE POLICY "Workspaces: Select" ON workspaces FOR SELECT TO authenticated USING (
  is_workspace_member(id) OR has_any_board_in_workspace(id) OR is_global_admin()
);

DROP POLICY IF EXISTS "Boards: Select" ON boards;
CREATE POLICY "Boards: Select" ON boards FOR SELECT TO authenticated USING (
  is_workspace_member(workspace_id) OR is_board_member_explicit(id) OR is_global_admin()
);
