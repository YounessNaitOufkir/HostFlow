-- =================================================================================
-- "Shared" now means visible to company staff, not just to admins
-- =================================================================================
--
-- Before this, a non-private workspace was automatically visible to admins only.
-- Every ordinary teammate still needed an explicit workspace_members row, so the
-- Invite buttons were doing real work even on shared workspaces and could not be
-- hidden.
--
-- HostFlow is also open to people outside the company, who keep private personal
-- workspaces here. So "visible to everyone with an account" would expose all
-- Host'lik work to any external signup.
--
-- A staff flag separates the two populations:
--
--   is_staff = true   company member. Sees every shared workspace automatically.
--   is_staff = false  external. Sees only what they create and what they are
--                     explicitly invited to. This is the default for new signups.
--
-- Existing profiles are marked staff, since they are all Host'lik accounts today.
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The flag
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_staff BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_staff IS
  'Company member. Sees all shared (non-private) workspaces without being invited. New signups default to false.';

-- Everyone currently in the system is Host'lik
UPDATE public.profiles SET is_staff = true WHERE is_staff = false;

-- ---------------------------------------------------------------------------
-- 2. Predicate
--
-- Admins count as staff implicitly, so an admin can never be locked out of
-- company work by a missing flag.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_company_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND (is_staff OR role = 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_company_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_staff() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Shared workspaces open up to staff
--
-- Only the last branch changes: is_global_admin() becomes is_company_staff().
-- Creator and explicit membership are untouched, and private workspaces are
-- still reachable only by their creator and invitees.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_workspace(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
     WHERE w.id = ws_id
       AND (
            w.created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.workspace_members m
                     WHERE m.workspace_id = w.id AND m.user_id = auth.uid())
         OR (COALESCE(w.is_private, false) = false AND public.is_company_staff())
       )
  );
$$;

-- Managing a workspace stays with its creator and admins. Being staff lets you
-- SEE shared work; it does not let you rename or delete somebody's workspace.
-- can_manage_workspace() is intentionally left as-is.

-- ---------------------------------------------------------------------------
-- 4. Expose the flag to the admin screens
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.user_directory AS
SELECT p.id,
       p.full_name,
       p.avatar_initials,
       p.avatar_url,
       p.color,
       p.role,
       p.is_owner,
       p.created_at,
       p.is_staff
  FROM public.profiles p
 WHERE p.id = auth.uid()
    OR public.is_global_admin()
    OR EXISTS (
         SELECT 1
           FROM public.workspace_members me
           JOIN public.workspace_members them
             ON them.workspace_id = me.workspace_id
          WHERE me.user_id = auth.uid() AND them.user_id = p.id
       )
    OR EXISTS (
         SELECT 1
           FROM public.board_members me
           JOIN public.board_members them
             ON them.board_id = me.board_id
          WHERE me.user_id = auth.uid() AND them.user_id = p.id
       );

REVOKE ALL ON public.user_directory FROM PUBLIC, anon;
GRANT SELECT ON public.user_directory TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Setting the flag
--
-- profiles UPDATE is restricted to your own row, so admins need an RPC, the same
-- pattern as set_user_role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_user_staff(target_user_id UUID, staff BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can change staff status.';
  END IF;

  -- The owner is always staff
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND is_owner)
     AND staff = false THEN
    RAISE EXCEPTION 'The platform owner is always a staff member.';
  END IF;

  UPDATE public.profiles SET is_staff = staff WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_staff(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_staff(UUID, BOOLEAN) TO authenticated;

COMMIT;
