-- =================================================================================
-- Harden SECURITY DEFINER functions
-- =================================================================================
--
-- Follow-up to 20260817000000, which fixed the two functions in the signup path.
-- The same two weaknesses affect the rest of them, both flagged by Supabase's
-- database linter:
--
--   0011_function_search_path_mutable
--     A SECURITY DEFINER function with no pinned search_path resolves unqualified
--     names using the *caller's* search_path. A caller who can influence it can
--     make a privileged function operate on objects they control. This is also
--     what broke signup: the trigger could not see `notification_preferences`.
--
--   0028 / 0029_{anon,authenticated}_security_definer_function_executable
--     Every one of these functions is currently executable by PUBLIC, so each is
--     reachable unauthenticated at /rest/v1/rpc/<name>. Trigger functions have no
--     business being callable at all.
--
-- Verified before writing this migration:
--   * All 12 policies granted to the `public` role use auth.uid()/auth.role()
--     directly and call none of these functions, so revoking `anon` breaks no RLS.
--   * The 56 `authenticated` policies do call the predicates below, so
--     `authenticated` keeps EXECUTE on those.
--   * Trigger functions need no EXECUTE grant; the trigger mechanism invokes them
--     independently of function privileges.
--
-- Function bodies are unchanged except restore_my_admin(), noted below.
-- =================================================================================

-- ---------------------------------------------------------------------------
-- 1. Pin search_path on every remaining function
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.handle_new_workspace()                                  SET search_path = public, pg_temp;
ALTER FUNCTION public.has_any_board_in_workspace(uuid)                        SET search_path = public, pg_temp;
ALTER FUNCTION public.invite_admin(uuid)                                      SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin_allowed_in_workspace(uuid)                     SET search_path = public, pg_temp;
ALTER FUNCTION public.is_board_member(uuid)                                   SET search_path = public, pg_temp;
ALTER FUNCTION public.is_board_member_explicit(uuid)                          SET search_path = public, pg_temp;
ALTER FUNCTION public.is_global_admin()                                       SET search_path = public, pg_temp;
ALTER FUNCTION public.is_member_of_both_items(uuid, uuid)                     SET search_path = public, pg_temp;
ALTER FUNCTION public.is_workspace_manager_or_admin(uuid)                     SET search_path = public, pg_temp;
ALTER FUNCTION public.is_workspace_member(uuid)                               SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_unauthorized_role_change()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.restore_my_admin()                                      SET search_path = public, pg_temp;
ALTER FUNCTION public.set_user_role(uuid, public.user_role)                   SET search_path = public, pg_temp;

-- Not SECURITY DEFINER, but flagged by the same linter rule
ALTER FUNCTION public.update_updated_at_column()                              SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2. Trigger-only functions: remove every execute privilege
--    These are invoked by triggers, never called directly.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.handle_new_user()                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_notification_preferences()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_workspace()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_unauthorized_role_change()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column()           FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS predicates: signed-in users only, never anonymous
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.has_any_board_in_workspace(uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_allowed_in_workspace(uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_board_member(uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_board_member_explicit(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_global_admin()                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_member_of_both_items(uuid, uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_workspace_manager_or_admin(uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid)             FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_any_board_in_workspace(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_allowed_in_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_board_member(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_board_member_explicit(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_global_admin()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_of_both_items(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_manager_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid)           TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Privileged RPCs the app calls: signed-in users only
--    Each performs its own authorisation check internally.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.invite_admin(uuid)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_role(uuid, public.user_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_my_admin()                    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.invite_admin(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_my_admin()                    TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. restore_my_admin(): fix a NULL-comparison hole in its guard
--
--    The guard was:  IF caller_email <> 'younessnaitoufkir@gmail.com' THEN RAISE
--
--    When the caller has no profile row, caller_email is NULL, so the comparison
--    evaluates to NULL rather than true, the RAISE is skipped, and execution
--    falls through to the UPDATE. Today that UPDATE matches zero rows because
--    auth.uid() is also NULL, so it is not currently exploitable -- but the guard
--    fails open, which is the wrong way for an admin-escalation check to fail.
--
--    IS DISTINCT FROM is NULL-safe, so a missing profile now raises.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_my_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied. Authentication required.';
  END IF;

  SELECT LOWER(email) INTO caller_email FROM public.profiles WHERE id = auth.uid();

  IF caller_email IS DISTINCT FROM 'younessnaitoufkir@gmail.com' THEN
    RAISE EXCEPTION 'Access denied. Only the platform owner can execute self-recovery.';
  END IF;

  UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.restore_my_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_my_admin() TO authenticated;
