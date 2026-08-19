-- =================================================================================
-- The Team badge is a hard ceiling on Host'lik work
-- =================================================================================
--
-- 20260818000008 introduced is_staff to separate company members from externals,
-- but left two ways around it:
--
--   1. is_company_staff() returned `is_staff OR role = 'admin'`, so granting
--      Administrator to an external handed them every shared workspace.
--   2. can_manage_workspace() used raw is_global_admin(), so an external admin
--      could DELETE Host'lik boards and items even where they could not read them.
--
-- The rule now: a non-private workspace is Host'lik work and is reachable only by
-- staff. Not by role, not by an invitation, not by having created something in it.
--
-- Private content is untouched. It remains creator + explicitly invited, which is
-- where collaboration with an external now lives: a shared workspace can no longer
-- host an outsider on a single board, a private one still can.
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Make "External Administrator" unrepresentable
--
-- One live row violates this (the E2E account, deliberately badged External).
-- The badge wins: it is the more specific statement of intent, and e2e/smoke.spec.ts
-- never authenticates, so nothing depends on that account holding admin.
-- ---------------------------------------------------------------------------

-- enforce_profile_role_protection calls is_global_admin(), which is false here:
-- a migration has no auth.uid(). Disable it for this one backfill rather than
-- weakening the trigger, and re-enable immediately.
ALTER TABLE public.profiles DISABLE TRIGGER enforce_profile_role_protection;

UPDATE public.profiles SET role = 'member' WHERE role = 'admin' AND is_staff = false;

ALTER TABLE public.profiles ENABLE TRIGGER enforce_profile_role_protection;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_admin_implies_staff;

-- IS DISTINCT FROM keeps this true for a NULL role, which is not an admin.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_admin_implies_staff
  CHECK (role IS DISTINCT FROM 'admin' OR is_staff);

COMMENT ON CONSTRAINT profiles_admin_implies_staff ON public.profiles IS
  'Administrator implies staff. An external must never reach Host''lik work, and role was a way around the badge.';

-- ---------------------------------------------------------------------------
-- 2. Drop the admin escape hatch from the staff predicate
--
-- The constraint above now guarantees admin => staff, so the old `OR role = admin`
-- is both redundant and the exact hole being closed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_company_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid() AND is_staff
  );
$$;

REVOKE ALL ON FUNCTION public.is_company_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_staff() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. One gate, applied identically in all three access functions
--
--   AND (is_private OR is_company_staff())
--
-- For a shared workspace the gate IS the rule: staff in, everyone else out, so the
-- trailing `OR NOT is_private` branch below is reached only by staff. For a private
-- workspace it passes trivially and the original creator/membership logic decides.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_workspace(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
     WHERE w.id = ws_id
       -- Host'lik work is staff-only.
       AND (COALESCE(w.is_private, false) = true OR public.is_company_staff())
       AND (
            w.created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.workspace_members m
                     WHERE m.workspace_id = w.id AND m.user_id = auth.uid())
         OR COALESCE(w.is_private, false) = false
       )
  );
$$;

-- The board's own workspace decides whether the board is Host'lik work, so the gate
-- is evaluated against the workspace. A board creator cannot outrank it either.
CREATE OR REPLACE FUNCTION public.can_access_board(b_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boards b
      JOIN public.workspaces w ON w.id = b.workspace_id
     WHERE b.id = b_id
       AND (COALESCE(w.is_private, false) = true OR public.is_company_staff())
       AND (
            b.created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.board_members bm
                     WHERE bm.board_id = b.id AND bm.user_id = auth.uid())
         -- Only an explicit board-level private blocks workspace inheritance.
         OR (COALESCE(b.is_private, false) = false
             AND public.can_access_workspace(b.workspace_id))
       )
  );
$$;

-- Managing shared work now requires staff as well as admin/creator/manager.
CREATE OR REPLACE FUNCTION public.can_manage_workspace(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
     WHERE w.id = ws_id
       AND (COALESCE(w.is_private, false) = true OR public.is_company_staff())
       AND (
            w.created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.workspace_members m
                     WHERE m.workspace_id = w.id AND m.user_id = auth.uid()
                       AND m.role IN ('admin', 'manager'))
         OR (COALESCE(w.is_private, false) = false AND public.is_global_admin())
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Close the creation loophole
--
-- Without this an external could create a NON-private workspace, which would be
-- Host'lik-classed content owned by someone the gate then locks out of it.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Workspaces: Insert" ON public.workspaces;
CREATE POLICY "Workspaces: Insert" ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (COALESCE(is_private, false) = true OR public.is_company_staff())
  );

-- Same predicate on UPDATE, so an external cannot flip their private workspace to
-- shared and strand it.
DROP POLICY IF EXISTS "Workspaces: Update" ON public.workspaces;
CREATE POLICY "Workspaces: Update" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (public.can_manage_workspace(id))
  WITH CHECK (
    public.can_manage_workspace(id)
    AND (COALESCE(is_private, false) = true OR public.is_company_staff())
  );

-- ---------------------------------------------------------------------------
-- 5. Friendly errors instead of a raw constraint violation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id UUID, new_role user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_role   user_role;
  target_is_owner BOOLEAN;
  target_is_staff BOOLEAN;
  admin_count     INTEGER;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can change roles.';
  END IF;

  SELECT role, is_owner, is_staff
    INTO existing_role, target_is_owner, target_is_staff
    FROM public.profiles WHERE id = target_user_id;

  IF target_is_owner AND new_role <> 'admin' THEN
    RAISE EXCEPTION 'Access denied. The platform owner cannot be demoted from Administrator.';
  END IF;

  -- An external must never reach Host'lik work, and Administrator would do exactly that.
  IF new_role = 'admin' AND NOT target_is_staff THEN
    RAISE EXCEPTION 'Make this person a Team member first. An External account cannot be an Administrator.';
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

REVOKE ALL ON FUNCTION public.set_user_role(UUID, user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, user_role) TO authenticated;

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

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND is_owner)
     AND staff = false THEN
    RAISE EXCEPTION 'The platform owner is always a staff member.';
  END IF;

  IF staff = false
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Change this person to Member first. An Administrator cannot be marked External.';
  END IF;

  UPDATE public.profiles SET is_staff = staff WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_staff(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_staff(UUID, BOOLEAN) TO authenticated;

COMMIT;
