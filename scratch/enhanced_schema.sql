-- ============================================================
-- Enhanced Database Schema for HostFlow
-- Production-grade schema with full RBAC, cross-board linking, and automations
-- ============================================================

-- ============================================================
-- 0. ENSURE CORE TABLES EXIST
-- Create these if they don't exist (basic structure)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'New Board',
    description TEXT DEFAULT '',
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    columns JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    color TEXT DEFAULT '#579bfc',
    position INTEGER DEFAULT 0,
    board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE,
    column_values JSONB DEFAULT '{}'::jsonb,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_initials TEXT,
    color TEXT DEFAULT '#579bfc',
    role TEXT DEFAULT 'member',
    allowed_workspaces UUID[] DEFAULT '{}',
    allowed_boards UUID[] DEFAULT '{}',
    timezone VARCHAR(50) DEFAULT 'UTC',
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ============================================================
-- 1. ENHANCED PROFILES TABLE
-- ============================================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- ============================================================
-- 2. ENHANCED BOARDS TABLE
-- ============================================================

ALTER TABLE public.boards
ADD COLUMN IF NOT EXISTS icon VARCHAR(50),
ADD COLUMN IF NOT EXISTS color VARCHAR(20),
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Add index for workspace lookups
CREATE INDEX IF NOT EXISTS idx_boards_workspace ON public.boards(workspace_id);

-- ============================================================
-- 3. ENHANCED GROUPS TABLE
-- ============================================================

ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS collapsed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_groups_board ON public.groups(board_id);
CREATE INDEX IF NOT EXISTS idx_groups_position ON public.groups(board_id, position);

-- ============================================================
-- 4. ENHANCED ITEMS TABLE
-- ============================================================

ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_items_board ON public.items(board_id);
CREATE INDEX IF NOT EXISTS idx_items_group ON public.items(group_id);
CREATE INDEX IF NOT EXISTS idx_items_position ON public.items(group_id, position);

-- ============================================================
-- 5. ITEM LINKS TABLE (Cross-board linking)
// ============================================================

CREATE TABLE IF NOT EXISTS public.item_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    target_item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    link_type VARCHAR(50) NOT NULL DEFAULT 'relates_to',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES auth.users(id),
    CONSTRAINT item_links_no_self_link CHECK (source_item_id != target_item_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_item_links_source ON public.item_links(source_item_id);
CREATE INDEX IF NOT EXISTS idx_item_links_target ON public.item_links(target_item_id);
CREATE INDEX IF NOT EXISTS idx_item_links_type ON public.item_links(link_type);

-- RLS for item links
ALTER TABLE public.item_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view item links for their boards"
    ON public.item_links
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.items i
            JOIN public.boards b ON b.id = i.board_id
            WHERE i.id = item_links.source_item_id
        )
    );

CREATE POLICY "Users can create item links"
    ON public.item_links
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.items i
            JOIN public.boards b ON b.id = i.board_id
            WHERE i.id = item_links.source_item_id
        )
    );

CREATE POLICY "Users can delete their own item links"
    ON public.item_links
    FOR DELETE
    USING (auth.uid() = created_by);

-- ============================================================
-- 6. ENHANCED AUTOMATIONS TABLE
-- ============================================================

-- Drop old table if exists and recreate
DROP TABLE IF EXISTS public.automations CASCADE;

CREATE TABLE IF NOT EXISTS public.automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255),
    enabled BOOLEAN DEFAULT TRUE NOT NULL,
    trigger_type VARCHAR(50) NOT NULL,
    trigger_column_id TEXT NOT NULL,
    trigger_value TEXT,
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_automations_board ON public.automations(board_id);
CREATE INDEX IF NOT EXISTS idx_automations_enabled ON public.automations(board_id, enabled);

-- RLS
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automations for their boards"
    ON public.automations
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.boards
            WHERE id = automations.board_id
        )
    );

CREATE POLICY "Users can create automations"
    ON public.automations
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.boards
            WHERE id = automations.board_id
        )
    );

CREATE POLICY "Users can update their own automations"
    ON public.automations
    FOR UPDATE
    USING (
        auth.uid() = created_by OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Users can delete their own automations"
    ON public.automations
    FOR DELETE
    USING (
        auth.uid() = created_by OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================
-- 7. ENHANCED NOTIFICATIONS TABLE
-- ============================================================

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS title VARCHAR(255),
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'info',
ADD COLUMN IF NOT EXISTS link TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read) 
WHERE read = FALSE;

-- ============================================================
-- 8. ACTIVITY LOGS ENHANCEMENT
-- ============================================================

ALTER TABLE public.activity_logs
ADD COLUMN IF NOT EXISTS user_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS details JSONB;

CREATE INDEX IF NOT EXISTS idx_activity_logs_item_created ON public.activity_logs(item_id, created_at DESC);

-- ============================================================
-- 9. ENHANCED UPDATES TABLE
-- ============================================================

ALTER TABLE public.updates
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS author_avatar VARCHAR(255),
ADD COLUMN IF NOT EXISTS author_color VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_updates_item_created ON public.updates(item_id, created_at DESC);

-- ============================================================
-- 10. UPDATES TRIGGER (updated_at automatically)
// ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at column
DROP TRIGGER IF EXISTS update_boards_updated_at ON public.boards;
CREATE TRIGGER update_boards_updated_at
    BEFORE UPDATE ON public.boards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_items_updated_at ON public.items;
CREATE TRIGGER update_items_updated_at
    BEFORE UPDATE ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_automations_updated_at ON public.automations;
CREATE TRIGGER update_automations_updated_at
    BEFORE UPDATE ON public.automations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_updates_updated_at ON public.updates;
CREATE TRIGGER update_updates_updated_at
    BEFORE UPDATE ON public.updates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 11. REALTIME PUBLICATIONS
-- ============================================================

-- Enable realtime for all relevant tables
DO $$
BEGIN
    -- Add tables to realtime publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE items;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'groups'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE groups;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'boards'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE boards;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'updates'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE updates;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'activity_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'item_links'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE item_links;
    END IF;
END $$;

-- ============================================================
-- 12. SEED DATA (Optional - for testing)
-- Skip this section if you already have data
-- ============================================================

-- Sample data insertion is intentionally minimal to avoid conflicts
-- The app will work with an empty database - users can create their own data
