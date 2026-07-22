-- =================================================================================
-- HostFlow: Soft Delete (Trash Folder)
-- Run this in the Supabase Dashboard -> SQL Editor -> New Query
-- =================================================================================

-- Add deleted_at column to items table
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Optional: If we had a view to automatically filter, we would create it here, 
-- but we will handle the filtering at the application layer to allow restoring items.
