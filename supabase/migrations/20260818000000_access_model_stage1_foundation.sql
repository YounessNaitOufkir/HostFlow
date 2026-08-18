-- =================================================================================
-- Access model, stage 1: foundation
-- =================================================================================
--
-- Schema only. No RLS policy is changed here, so behaviour is unchanged after
-- running this apart from the three owner checks noted in section 6. The RLS
-- rebuild lands separately once this foundation is in place.
--
-- See ACCESS_MODEL.md for the design this implements.
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Owner flag
--
-- The platform owner is currently hardcoded as 'younessnaitoufkir@gmail.com' in
-- three SQL functions and in the UI, so changing that email would lock the owner
-- out of their own recovery path. Promote it to a real column.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

UPDATE public.profiles
   SET is_owner = true
 WHERE LOWER(email) = 'younessnaitoufkir@gmail.com';

-- Exactly one owner. Guards against a second owner being created by accident.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_single_owner_idx
  ON public.profiles ((is_owner)) WHERE is_owner;

-- ---------------------------------------------------------------------------
-- 2. Retire the unused roles
--
-- 'contractor' was being used as a blunt way to stop new users seeing company
-- data. Membership now does that job, so collapse to admin | member.
-- The enum values stay: removing enum values in Postgres is disruptive.
-- ---------------------------------------------------------------------------

UPDATE public.profiles
   SET role = 'member'
 WHERE role IN ('contractor', 'manager');

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'member'::user_role;

-- ---------------------------------------------------------------------------
-- 3. Creator ownership
--
-- Private content belongs to whoever created it, so both tables need a creator.
-- Existing rows are all Host'lik company content, so they are attributed to the
-- owner.
-- ---------------------------------------------------------------------------

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.workspaces w
   SET created_by = (SELECT id FROM public.profiles WHERE is_owner LIMIT 1)
 WHERE w.created_by IS NULL;

UPDATE public.boards b
   SET created_by = (SELECT id FROM public.profiles WHERE is_owner LIMIT 1)
 WHERE b.created_by IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Board-level privacy, inherited from the workspace
--
-- NULL means "inherit from my workspace", which is how a board created inside a
-- private workspace becomes private while one created in a company workspace
-- stays shared. Effective privacy is COALESCE(board, workspace, false).
-- ---------------------------------------------------------------------------

ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.boards.is_private IS
  'NULL = inherit from workspace. true/false = explicit override.';

CREATE OR REPLACE FUNCTION public.board_is_private(b_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(b.is_private, w.is_private, false)
    FROM public.boards b
    LEFT JOIN public.workspaces w ON w.id = b.workspace_id
   WHERE b.id = b_id;
$$;

REVOKE ALL ON FUNCTION public.board_is_private(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_is_private(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Migrate the array grants onto the membership tables
--
-- profiles.allowed_workspaces / allowed_boards duplicated the join tables,
-- could not record who granted access or when, and already contained references
-- to boards that no longer exist. Copy what is still valid, then retire them.
--
-- The columns are kept (not dropped) until the application stops reading them;
-- a later migration removes them.
-- ---------------------------------------------------------------------------

INSERT INTO public.workspace_members (user_id, workspace_id, role)
SELECT p.id, ws_id, 'member'::user_role
  FROM public.profiles p
  CROSS JOIN LATERAL unnest(p.allowed_workspaces) AS ws_id
 WHERE EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = ws_id)
   AND NOT EXISTS (
     SELECT 1 FROM public.workspace_members m
      WHERE m.user_id = p.id AND m.workspace_id = ws_id
   );

INSERT INTO public.board_members (user_id, board_id, role)
SELECT p.id, b_id, 'member'::user_role
  FROM public.profiles p
  CROSS JOIN LATERAL unnest(p.allowed_boards) AS b_id
 WHERE EXISTS (SELECT 1 FROM public.boards b WHERE b.id = b_id)
   AND NOT EXISTS (
     SELECT 1 FROM public.board_members m
      WHERE m.user_id = p.id AND m.board_id = b_id
   );

COMMENT ON COLUMN public.profiles.allowed_workspaces IS
  'DEPRECATED - superseded by workspace_members. Removed once the app stops reading it.';
COMMENT ON COLUMN public.profiles.allowed_boards IS
  'DEPRECATED - superseded by board_members. Removed once the app stops reading it.';

-- Prevent duplicate grants from here on
CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_unique_idx
  ON public.workspace_members (user_id, workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS board_members_unique_idx
  ON public.board_members (user_id, board_id);

-- ---------------------------------------------------------------------------
-- 6. Owner checks now use the flag instead of a hardcoded email
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_owner
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_my_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied. Authentication required.';
  END IF;

  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Access denied. Only the platform owner can execute self-recovery.';
  END IF;

  UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- The owner must always remain an administrator
    IF OLD.is_owner OR NEW.is_owner THEN
      IF NEW.role <> 'admin' THEN
        RAISE EXCEPTION 'The platform owner must always remain an Administrator.';
      END IF;
      RETURN NEW;
    END IF;

    IF NOT public.is_global_admin() THEN
      RAISE EXCEPTION 'Access denied. Only global administrators can change user roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id uuid, new_role user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_role  user_role;
  target_is_owner BOOLEAN;
  admin_count    INTEGER;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can change roles.';
  END IF;

  SELECT role, is_owner INTO existing_role, target_is_owner
    FROM public.profiles WHERE id = target_user_id;

  IF target_is_owner AND new_role <> 'admin' THEN
    RAISE EXCEPTION 'Access denied. The platform owner cannot be demoted from Administrator.';
  END IF;

  IF existing_role = 'admin' AND new_role <> 'admin' THEN
    SELECT COUNT(*) INTO admin_count FROM public.profiles WHERE role = 'admin';
    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove admin privileges from the only remaining administrator.';
    END IF;
  END IF;

  UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Remove the dead notification_preferences table
--
-- No application code has ever read or written it; the four profiles.*_enabled
-- flags are the real preferences. Its AFTER INSERT trigger on profiles is what
-- broke every signup between 2026-07-25 and 2026-08-17.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_profile_created_create_preferences ON public.profiles;
DROP FUNCTION IF EXISTS public.create_notification_preferences();
DROP TABLE IF EXISTS public.notification_preferences;

COMMIT;
