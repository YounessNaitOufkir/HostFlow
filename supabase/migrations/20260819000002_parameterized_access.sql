-- =================================================================================
-- One access rule, callable for any user id
-- =================================================================================
--
-- /api/v1/tasks authenticates with an API key and runs service-role, so auth.uid()
-- is NULL and every can_access_* predicate silently answers "no". The route needs
-- "which boards may THIS user reach", which previously it simply did not ask —
-- it took boards.select('id').limit(1) across the whole table.
--
-- Rather than restate the rule for the API (a second copy is precisely how the
-- staff/directory drift happened), the predicate moves into *_as(u_id, ...) and the
-- auth.uid() versions become one-line wrappers. There is one definition of access.
--
-- The *_as forms are service_role only. Handing them to authenticated would let any
-- user probe what somebody else can see.
-- =================================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_company_staff_as(u_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = u_id AND is_staff);
$$;

CREATE OR REPLACE FUNCTION public.can_access_workspace_as(u_id UUID, ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
     WHERE w.id = ws_id
       -- Host'lik work is staff-only.
       AND (COALESCE(w.is_private, false) = true OR public.is_company_staff_as(u_id))
       AND (
            w.created_by = u_id
         OR EXISTS (SELECT 1 FROM public.workspace_members m
                     WHERE m.workspace_id = w.id AND m.user_id = u_id)
         OR COALESCE(w.is_private, false) = false
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_board_as(u_id UUID, b_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boards b
      JOIN public.workspaces w ON w.id = b.workspace_id
     WHERE b.id = b_id
       AND (COALESCE(w.is_private, false) = true OR public.is_company_staff_as(u_id))
       AND (
            b.created_by = u_id
         OR EXISTS (SELECT 1 FROM public.board_members bm
                     WHERE bm.board_id = b.id AND bm.user_id = u_id)
         OR (COALESCE(b.is_private, false) = false
             AND public.can_access_workspace_as(u_id, b.workspace_id))
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- The session-scoped forms now delegate, so they cannot drift.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_company_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.is_company_staff_as(auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.can_access_workspace(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.can_access_workspace_as(auth.uid(), ws_id); $$;

CREATE OR REPLACE FUNCTION public.can_access_board(b_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.can_access_board_as(auth.uid(), b_id); $$;

-- ---------------------------------------------------------------------------
-- What /api/v1/tasks actually asks for.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.boards_for_user(u_id UUID)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id FROM public.boards b
   WHERE public.can_access_board_as(u_id, b.id)
   ORDER BY b.id;
$$;

REVOKE ALL ON FUNCTION public.is_company_staff_as(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_workspace_as(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_board_as(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.boards_for_user(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_company_staff_as(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_workspace_as(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_board_as(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.boards_for_user(UUID) TO service_role;

COMMIT;
