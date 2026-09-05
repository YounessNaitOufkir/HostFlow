-- =================================================================================
-- Staff can see each other in the people directory
-- =================================================================================
--
-- 20260818000008 opened every shared workspace to staff:
--
--   OR (COALESCE(w.is_private, false) = false AND public.is_company_staff())
--
-- but left user_directory recognising colleagues only through explicit
-- workspace_members / board_members rows. The two rules were never reconciled,
-- so a staff member with no membership row anywhere could open a shared board
-- and still see nobody: the directory returned exactly one row, themselves.
--
-- The visible symptom is a People column that renders assigned items as
-- unassigned. PeopleCell resolves ids against this view client-side, and an id
-- it cannot resolve simply disappears — assigned work looks like free work.
--
-- Staff all reach every non-private workspace by construction, so they are
-- colleagues by construction too. That is the branch added here.
--
-- Externals (is_staff = false) are deliberately NOT covered. They stay reachable
-- only through an explicit shared membership row, exactly as before — being able
-- to open a shared workspace does not make the outside world visible to you, and
-- does not make you visible to it.
-- =================================================================================

BEGIN;

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
    -- Staff share every non-private workspace, so they must be able to see and
    -- assign one another. Externals are excluded on purpose; they are matched
    -- only by the explicit membership branches below.
    OR (public.is_company_staff() AND p.is_staff)
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

-- ---------------------------------------------------------------------------
-- Make the directory genuinely read-only
--
-- Every previous migration wrote "REVOKE ALL ... FROM PUBLIC, anon" and then
-- granted SELECT to authenticated — but never revoked from authenticated, which
-- Supabase had already granted ALL on by default. The result:
--
--   * the view is auto-updatable (single table, plain column references),
--   * security_invoker is deliberately unset, so writes run as the view owner
--     (postgres) and bypass RLS on profiles,
--   * authenticated held INSERT / UPDATE / DELETE.
--
-- So any logged-in user could write to profiles through the view. The role
-- column is covered by enforce_profile_role_protection, but is_staff is not —
-- an external could run
--
--   UPDATE public.user_directory SET is_staff = true WHERE id = auth.uid();
--
-- and hand themselves every shared workspace. Their own row is always visible
-- via the first branch, so this needed no other access.
--
-- Revoke from authenticated as well, then grant back only SELECT.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.user_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_directory TO authenticated;

COMMIT;
