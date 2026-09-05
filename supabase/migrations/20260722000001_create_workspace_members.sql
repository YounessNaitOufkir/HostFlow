-- Create workspace_members table
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role user_role DEFAULT 'member'::user_role,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, workspace_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);

-- Enable RLS
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Migration: Backfill existing allowed_workspaces array into workspace_members table
DO $$
DECLARE
  profile_rec RECORD;
  ws_id UUID;
BEGIN
  -- Loop through all profiles
  FOR profile_rec IN SELECT id, role, allowed_workspaces FROM profiles LOOP
    IF profile_rec.allowed_workspaces IS NOT NULL THEN
      -- Loop through each workspace ID in the array
      FOREACH ws_id IN ARRAY profile_rec.allowed_workspaces LOOP
        -- Insert a record into workspace_members
        -- We'll use the profile's global role as their workspace role initially
        BEGIN
          INSERT INTO workspace_members (user_id, workspace_id, role)
          VALUES (profile_rec.id, ws_id, COALESCE(profile_rec.role, 'member'::user_role))
          ON CONFLICT (user_id, workspace_id) DO NOTHING;
        EXCEPTION WHEN foreign_key_violation THEN
          -- Ignore if the workspace ID doesn't exist anymore
        END;
      END LOOP;
    END IF;
  END LOOP;
END $$;
