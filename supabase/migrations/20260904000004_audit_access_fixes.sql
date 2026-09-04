-- Applied via the Supabase API on 2026-09-04; kept here so the schema history
-- is complete and a fresh environment builds the same shape.
--
-- Three findings from a full policy audit. Each is the same shape as the
-- `updates` leak fixed earlier: a permissive policy with no ownership or board
-- check sitting beside a correct one. RLS ORs permissive policies, so the
-- loosest one decides.

-- 1. activity_logs -------------------------------------------------------
-- Readable by its author, or by any global admin, and nobody else. Both
-- halves wrong. `is_global_admin()` ignores the board, so an administrator
-- read the change history of PRIVATE workspaces - measured: 0 of 4 private
-- boards visible, all 14 of their activity rows readable, with `action`
-- carrying the column name and both values. And a member with full access to
-- a board saw NO activity on it, because the row belongs to whoever made the
-- change: the item activity feed was empty for everyone but the last editor.
drop policy if exists "ActivityLogs: Select" on public.activity_logs;
drop policy if exists "Users can only view their own activity logs" on public.activity_logs;

create policy "ActivityLogs: Select" on public.activity_logs
  for select using (
    auth.uid() = user_id
    or public.can_access_board(board_id)
  );

drop policy if exists "Users can insert their own activity logs" on public.activity_logs;

-- 2. webhooks ------------------------------------------------------------
-- `(board_id IS NULL) OR is_board_member(board_id)` matched for every
-- authenticated caller on a global webhook. endpoint_url routinely carries
-- its own token, so reading one is being able to post to it. Creating a
-- global webhook already required a global admin; reading one now matches.
drop policy if exists "Webhooks: Select" on public.webhooks;

create policy "Webhooks: Select" on public.webhooks
  for select using (
    case when board_id is null
      then public.is_global_admin()
      else public.is_board_member(board_id)
    end
  );

-- 3. storage.objects, attachments bucket ---------------------------------
-- A SELECT policy of just `bucket_id = 'attachments'` beside an owner-scoped
-- one. Verified with a fixture holding no workspace and no board: it listed
-- all six objects and downloaded a 178 KB JPEG. Anonymous callers were
-- refused, so it took a login - but any login.
--
-- Restricting to the uploader breaks nothing that works: the app builds these
-- links with getPublicUrl(), which returns 400 on a private bucket, and no
-- comment references one. Serving them properly needs signed URLs minted
-- after a board check, since the object path carries no board to authorise
-- against - a change to the upload and render paths, left as follow-up.
drop policy if exists "Attachments: Select" on storage.objects;
