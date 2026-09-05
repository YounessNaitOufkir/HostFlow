-- =================================================================================
-- HostFlow: Complete Database Initialization Script (Step 1)
-- Run this in the Supabase Dashboard -> SQL Editor -> New Query
-- =================================================================================

-- --------------------------------------------------------
-- 1. ENUMS (Strict Typings)
-- --------------------------------------------------------
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'manager', 'member', 'contractor'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE board_type AS ENUM ('standard', 'properties', 'contractors', 'procurement', 'crm'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE link_type AS ENUM ('dependency', 'relation', 'subitem'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- --------------------------------------------------------
-- 2. CORE TABLES
-- --------------------------------------------------------

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_initials TEXT,
  color TEXT,
  role user_role DEFAULT 'member'::user_role,
  allowed_workspaces UUID[] DEFAULT '{}',
  allowed_boards UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Boards
CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  columns JSONB DEFAULT '[]'::jsonb,
  position INTEGER DEFAULT 0,
  type board_type DEFAULT 'standard'::board_type,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  color TEXT,
  position INTEGER DEFAULT 0,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items (The core entity: Tasks, Properties, Contractors, etc.)
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_values JSONB DEFAULT '{}'::jsonb,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------
-- 3. HOSTFLOW RELATIONAL TABLE (New!)
-- --------------------------------------------------------

-- Item Links (Many-to-Many associations across boards)
CREATE TABLE IF NOT EXISTS item_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  target_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  link_type link_type DEFAULT 'relation'::link_type,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_item_id, target_item_id, link_type)
);

-- --------------------------------------------------------
-- 4. UTILITY TABLES
-- --------------------------------------------------------

-- Automations
CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  trigger_column_id TEXT NOT NULL,
  trigger_value TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_target_id TEXT NOT NULL,
  action_payload JSONB DEFAULT '{}'::jsonb,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------
-- 5. TRIGGERS & FUNCTIONS
-- --------------------------------------------------------

-- Auto-update `updated_at` on items
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

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_initials, color, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    UPPER(SUBSTRING(COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) FROM 1 FOR 2)),
    '#579bfc',
    'member'::user_role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- --------------------------------------------------------
-- 6. INDEXES
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_boards_workspace_id ON boards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_boards_type ON boards(type);
CREATE INDEX IF NOT EXISTS idx_groups_board_id ON groups(board_id);
CREATE INDEX IF NOT EXISTS idx_items_board_id ON items(board_id);
CREATE INDEX IF NOT EXISTS idx_items_group_id ON items(group_id);
CREATE INDEX IF NOT EXISTS idx_item_links_source ON item_links(source_item_id);
CREATE INDEX IF NOT EXISTS idx_item_links_target ON item_links(target_item_id);
CREATE INDEX IF NOT EXISTS idx_automations_board_id ON automations(board_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_item_id ON activity_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- --------------------------------------------------------
-- 7. REALTIME & RLS (Row Level Security)
-- --------------------------------------------------------

-- Enable Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  
  ALTER PUBLICATION supabase_realtime ADD TABLE items;
  ALTER PUBLICATION supabase_realtime ADD TABLE groups;
  ALTER PUBLICATION supabase_realtime ADD TABLE boards;
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  ALTER PUBLICATION supabase_realtime ADD TABLE item_links;
EXCEPTION WHEN OTHERS THEN
  -- Ignore duplicate table in publication errors
END $$;

-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (for MVP stage, restrict later if needed)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['workspaces','profiles','boards','groups','items','item_links','automations','notifications','activity_logs'])
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "%1$s_auth_all" ON %1$s;
      CREATE POLICY "%1$s_auth_all" ON %1$s FOR ALL TO authenticated USING (true) WITH CHECK (true);
    ', tbl);
  END LOOP;
END $$;
