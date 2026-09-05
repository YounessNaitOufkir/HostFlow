-- ============================================================
-- Host'Lik PM — Schema Hardening Migration
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Add timestamps to items table
ALTER TABLE items 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS items_updated_at ON items;
CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2. Add 'enabled' flag to automations
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS action_payload JSONB DEFAULT '{}';

-- 3. Add position column to boards for ordering
ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS idx_boards_workspace_id ON boards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_items_board_id ON items(board_id);
CREATE INDEX IF NOT EXISTS idx_items_group_id ON items(group_id);
CREATE INDEX IF NOT EXISTS idx_groups_board_id ON groups(board_id);
CREATE INDEX IF NOT EXISTS idx_automations_board_id ON automations(board_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_item_id ON activity_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- 5. Enable Realtime for relevant tables (run each separately if errors)
-- ALTER PUBLICATION supabase_realtime ADD TABLE items;
-- ALTER PUBLICATION supabase_realtime ADD TABLE groups;
-- ALTER PUBLICATION supabase_realtime ADD TABLE boards;
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 6. Row Level Security — basic authenticated access
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
