-- =================================================================================
-- HostFlow: Privilege Grants (Step 1.1)
-- Run this in the Supabase Dashboard -> SQL Editor -> New Query
-- =================================================================================

-- Grant USAGE on the public schema (usually default, but good to be safe)
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant ALL privileges on all currently existing tables in the public schema to the authenticated role
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated;

-- Grant ALL privileges on all currently existing sequences (if any are used for IDs, though we use UUIDs mostly)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Ensure that any future tables created by the postgres role also grant these privileges automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO authenticated;
