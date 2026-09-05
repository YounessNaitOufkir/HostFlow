-- =================================================================================
-- HostFlow: Add parent_id and deleted_at to Updates Table
-- Run this in the Supabase Dashboard -> SQL Editor -> New Query
-- =================================================================================

-- 1. Add parent_id for nested replies
ALTER TABLE public.updates ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.updates(id) ON DELETE CASCADE;

-- 2. Add deleted_at for soft deletion
ALTER TABLE public.updates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Update policies for updates table to handle deleted_at if necessary
-- The existing policies allow select/insert/update/delete. Soft deletion will just be an UPDATE setting deleted_at.
