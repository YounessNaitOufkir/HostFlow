-- =================================================================================
-- The Team badge is a ceiling, not a grant
-- =================================================================================
--
-- Until now `is_staff` did two jobs at once: it gated company content (a ceiling
-- externals cannot pass) and it *granted* that content outright. The second job
-- is wrong for the business. A marketing hire is Team, but must not read the
-- Communication or Lancement boards.
--
-- The offending branch lived in can_access_workspace_as():
--
--     OR COALESCE(w.is_private, false) = false
--
-- i.e. "any staff user reaches any shared workspace". It made every row in
-- workspace_members / board_members decorative for staff, which is why the
-- Data Access toggles in the admin panel appeared to do nothing.
--
-- After this migration:
--
--   Admin        (is_staff, role=admin)   all company content, by role
--   Team member  (is_staff, role=member)  ONLY explicit workspace/board grants
--   External     (not is_staff)           no company content at all (unchanged)
--
-- Deliberately unchanged: private content stays visible only to its creator and
-- to people they invited. Admins do not bypass it and the owner does not bypass
-- it. That is the product's core promise and this migration must not weaken it —
-- note the new admin branch is guarded by `is_private = false`.
--
-- Also unchanged: can_access_board_as(), which already delegates here for its
-- inherit-from-workspace branch while keeping its own board_members branch. That
-- combination is exactly how "Marketing but not Communication, same workspace"
-- is expressed. can_manage_workspace()/can_manage_board() are untouched too, so
-- handing out access remains an admin power.
--
-- Rollback is instant and lossless: restore the bare
-- `OR COALESCE(w.is_private, false) = false` branch below. No data is migrated.
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. A parameterized admin check
--
-- is_global_admin() reads auth.uid(), which is NULL under service_role, so the
-- *_as family needs its own form for the same reason can_access_workspace_as
-- exists at all. Service-role only: handing the _as functions to authenticated
-- would let any user probe what somebody else can see.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_global_admin_as(u_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = u_id AND role = 'admin');
$$;

REVOKE ALL ON FUNCTION public.is_global_admin_as(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_global_admin_as(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Shared workspaces are no longer open to all staff
--
-- Identical to 20260819000002 except for the final branch. can_access_workspace()
-- and can_access_board() are one-line wrappers over the _as forms, so the app,
-- every RLS policy and /api/v1/tasks all pick this up from one edit.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_workspace_as(u_id UUID, ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
     WHERE w.id = ws_id
       -- Host'lik work is staff-only. Necessary, and now no longer sufficient.
       AND (COALESCE(w.is_private, false) = true OR public.is_company_staff_as(u_id))
       AND (
            w.created_by = u_id
         OR EXISTS (SELECT 1 FROM public.workspace_members m
                     WHERE m.workspace_id = w.id AND m.user_id = u_id)
         -- Was: OR COALESCE(w.is_private, false) = false -- every staff user.
         -- Now admins only, and still never for private content.
         OR (COALESCE(w.is_private, false) = false AND public.is_global_admin_as(u_id))
       )
  );
$$;

COMMIT;
