-- =================================================================================
-- HostFlow: Add board_id and item_id to Notifications Table
-- Run this in the Supabase Dashboard -> SQL Editor -> New Query
-- =================================================================================

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.items(id) ON DELETE CASCADE;
