-- Migration: Comprehensive Settings Feature

-- 1. organization_settings
CREATE TABLE IF NOT EXISTS organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT DEFAULT 'My Organization',
    logo_url TEXT,
    primary_color TEXT DEFAULT '#0073ea',
    default_timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default row if empty
INSERT INTO organization_settings (company_name)
SELECT 'My Organization'
WHERE NOT EXISTS (SELECT 1 FROM organization_settings);

-- RLS for organization_settings
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings: Select" ON organization_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Settings: Update" ON organization_settings FOR UPDATE TO authenticated USING (is_global_admin());

-- 2. teams
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT DEFAULT '#579bfc',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teams: Select" ON teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teams: Insert" ON teams FOR INSERT TO authenticated WITH CHECK (is_global_admin());
CREATE POLICY "Teams: Update" ON teams FOR UPDATE TO authenticated USING (is_global_admin());
CREATE POLICY "Teams: Delete" ON teams FOR DELETE TO authenticated USING (is_global_admin());

-- 3. team_members
CREATE TABLE IF NOT EXISTS team_members (
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TeamMembers: Select" ON team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "TeamMembers: Insert" ON team_members FOR INSERT TO authenticated WITH CHECK (is_global_admin());
CREATE POLICY "TeamMembers: Delete" ON team_members FOR DELETE TO authenticated USING (is_global_admin());

-- 4. api_keys
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ApiKeys: Select" ON api_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ApiKeys: Insert" ON api_keys FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ApiKeys: Delete" ON api_keys FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. webhooks
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    endpoint_url TEXT NOT NULL,
    events JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Webhooks: Select" ON webhooks FOR SELECT TO authenticated USING (
    board_id IS NULL OR is_board_member(board_id)
);
CREATE POLICY "Webhooks: All" ON webhooks FOR ALL TO authenticated USING (
    board_id IS NULL AND is_global_admin() OR (board_id IS NOT NULL AND is_board_member(board_id))
);

-- 6. global_status_labels
CREATE TABLE IF NOT EXISTS global_status_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    color TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE global_status_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "GlobalStatusLabels: Select" ON global_status_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "GlobalStatusLabels: All" ON global_status_labels FOR ALL TO authenticated USING (is_global_admin());

-- Insert defaults
INSERT INTO global_status_labels (label, color, position)
SELECT 'Done', 'bg-[#00c875]', 0
WHERE NOT EXISTS (SELECT 1 FROM global_status_labels);

INSERT INTO global_status_labels (label, color, position)
SELECT 'Working on it', 'bg-[#fdab3d]', 1
WHERE NOT EXISTS (SELECT 1 FROM global_status_labels WHERE label = 'Working on it');

INSERT INTO global_status_labels (label, color, position)
SELECT 'Stuck', 'bg-[#e2445c]', 2
WHERE NOT EXISTS (SELECT 1 FROM global_status_labels WHERE label = 'Stuck');

INSERT INTO global_status_labels (label, color, position)
SELECT 'Empty', 'bg-[#c4c4c4]', 3
WHERE NOT EXISTS (SELECT 1 FROM global_status_labels WHERE label = 'Empty');


-- 7. notification_preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    email_notifications BOOLEAN DEFAULT true,
    in_app_notifications BOOLEAN DEFAULT true,
    daily_digest BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger to create preferences row on profile creation
CREATE OR REPLACE FUNCTION create_notification_preferences() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_create_preferences ON profiles;
CREATE TRIGGER on_profile_created_create_preferences
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE PROCEDURE create_notification_preferences();

-- Insert existing users
INSERT INTO notification_preferences (user_id)
SELECT id FROM profiles
ON CONFLICT DO NOTHING;

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NotifPrefs: Select" ON notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "NotifPrefs: Update" ON notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Update realtime publications
ALTER PUBLICATION supabase_realtime ADD TABLE organization_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
ALTER PUBLICATION supabase_realtime ADD TABLE global_status_labels;
