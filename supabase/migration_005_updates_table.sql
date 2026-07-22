-- =================================================================================
-- HostFlow: Create Updates Table
-- Run this in the Supabase Dashboard -> SQL Editor -> New Query
-- =================================================================================

-- 1. Create the updates table
CREATE TABLE IF NOT EXISTS public.updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.updates ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Allow authenticated users to read all updates
CREATE POLICY "Enable read access for all authenticated users on updates"
ON public.updates FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert updates
CREATE POLICY "Enable insert for authenticated users on updates"
ON public.updates FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to update their own updates
CREATE POLICY "Enable update for users based on author_id"
ON public.updates FOR UPDATE
TO authenticated
USING (auth.uid() = author_id);

-- Allow users to delete their own updates
CREATE POLICY "Enable delete for users based on author_id"
ON public.updates FOR DELETE
TO authenticated
USING (auth.uid() = author_id);
