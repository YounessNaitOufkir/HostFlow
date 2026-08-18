-- =================================================================================
-- Verification for 20260818000001 (stage 2 RLS). Read-only -- safe to re-run.
-- Not a migration; run it in the SQL editor after applying stage 2.
-- =================================================================================

-- 1. Access matrix: who can reach which board, evaluated per user.
--    Expected:
--      Youness (owner/admin)   -> every board
--      Amine   (App C member)  -> every non-private board in App C
--      Yasser  (Communication) -> Communication only, NOT Marketing
--      E2E     (admin)         -> every non-private board
WITH u AS (SELECT id, COALESCE(full_name, email) AS who, role, is_owner FROM public.profiles)
SELECT u.who,
       w.name  AS workspace,
       b.name  AS board,
       COALESCE(b.is_private, w.is_private, false) AS board_effectively_private,
       EXISTS (SELECT 1 FROM public.workspace_members m
                WHERE m.workspace_id = w.id AND m.user_id = u.id) AS ws_grant,
       EXISTS (SELECT 1 FROM public.board_members bm
                WHERE bm.board_id = b.id AND bm.user_id = u.id)   AS board_grant,
       (b.created_by = u.id)                                      AS is_board_creator,
       -- mirrors can_access_board() without needing auth.uid()
       (
         b.created_by = u.id
         OR EXISTS (SELECT 1 FROM public.board_members bm
                     WHERE bm.board_id = b.id AND bm.user_id = u.id)
         OR (
              COALESCE(b.is_private, w.is_private, false) = false
              AND (
                   w.created_by = u.id
                OR EXISTS (SELECT 1 FROM public.workspace_members m
                            WHERE m.workspace_id = w.id AND m.user_id = u.id)
                OR (COALESCE(w.is_private, false) = false AND u.role = 'admin')
              )
            )
       ) AS can_access
  FROM u
  CROSS JOIN public.boards b
  JOIN public.workspaces w ON w.id = b.workspace_id
 ORDER BY u.who, w.name, b.name;

-- 2. Nobody should be locked out of content they created.
--    Expected: zero rows.
SELECT 'orphaned board' AS problem, b.id, b.name
  FROM public.boards b
 WHERE b.created_by IS NULL
UNION ALL
SELECT 'orphaned workspace', w.id, w.name
  FROM public.workspaces w
 WHERE w.created_by IS NULL;

-- 3. Private content must never be reachable by a non-creator, non-grantee,
--    regardless of admin status.
--    Expected: zero rows.
SELECT p.email AS admin_who_can_reach_private, w.name AS private_workspace
  FROM public.profiles p
  CROSS JOIN public.workspaces w
 WHERE w.is_private
   AND p.role = 'admin'
   AND w.created_by <> p.id
   AND NOT EXISTS (SELECT 1 FROM public.workspace_members m
                    WHERE m.workspace_id = w.id AND m.user_id = p.id)
   -- if can_access_workspace ever returns true here, the privacy promise is broken
   AND public.can_access_workspace(w.id);

-- 4. Policy inventory -- confirm the expected policies exist and nothing
--    permissive was left behind on the core tables.
SELECT tablename, policyname, cmd, roles::text
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('workspaces','boards','groups','items','item_links')
 ORDER BY tablename, cmd, policyname;

-- 5. No SECURITY DEFINER function should be missing a pinned search_path.
--    Expected: zero rows.
SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef AND p.proconfig IS NULL;
