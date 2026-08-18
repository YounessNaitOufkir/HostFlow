-- =================================================================================
-- Access model, stage 3: profiles, directory, and the signup flow
-- =================================================================================
--
-- Three problems solved here:
--
--   1. `profiles` carried TWO overlapping SELECT policies, both USING (true),
--      granted to the `public` role. Permissive policies are OR'd, so every
--      user's name AND email was readable by anyone, signed in or not.
--
--   2. RLS is row-level: it cannot show a row's name while hiding its email.
--      Names must be visible to workspace colleagues, emails only to the owner,
--      so the two need separate surfaces -- hence the user_directory view.
--
--   3. Signup did too much from the client: it re-upserted the profile with the
--      now-retired 'contractor' role, and it read every admin's row then wrote
--      notification rows for them. That only worked because `notifications`
--      accepted an INSERT from anyone, for anyone.
--
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. profiles: your own row, and the owner's view of everyone
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Profiles are viewable by everyone"   ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Select"                    ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Update"                    ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile"  ON public.profiles;

-- Emails live on this table, so direct reads are limited to yourself and the
-- platform owner. Everything else in the app reads user_directory instead.
CREATE POLICY "Profiles: Select own or owner" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_platform_owner());

CREATE POLICY "Profiles: Update own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- The handle_new_user trigger creates profiles. A client insert is not needed
-- and would be a way to forge a row, so no INSERT policy is granted.

-- ---------------------------------------------------------------------------
-- 2. user_directory: names without emails
--
-- Runs with the view owner's privileges (security_invoker is deliberately NOT
-- set), so it can see past the profiles policy above. Visibility is enforced by
-- its own WHERE clause: yourself, anyone you share a workspace or board with,
-- and -- for user management -- admins see everyone.
--
-- The email column is simply absent. It cannot leak through this surface.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.user_directory;

CREATE VIEW public.user_directory AS
SELECT p.id,
       p.full_name,
       p.avatar_initials,
       p.avatar_url,
       p.color,
       p.role,
       p.is_owner,
       p.created_at
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

COMMENT ON VIEW public.user_directory IS
  'Names and avatars of users you share a workspace or board with. Never exposes email.';

-- ---------------------------------------------------------------------------
-- 3. notifications: stop clients writing rows for other users
--
-- Both INSERT policies had WITH CHECK (true), so any signed-in user could push
-- an arbitrary in-app message to anybody. Notifications for other people are
-- now created only by SECURITY DEFINER functions and the service role.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: Insert"           ON public.notifications;

CREATE POLICY "Notifications: Insert own" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Mentions, assignment alerts and automations legitimately notify OTHER people.
-- They go through this function instead of a direct insert, so the recipient
-- list is authorised server-side: you may only notify someone you already share
-- a workspace or board with, and only about a board you can reach yourself.
CREATE OR REPLACE FUNCTION public.notify_users(
  recipient_ids UUID[],
  message       TEXT,
  board_id      UUID DEFAULT NULL,
  item_id       UUID DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF message IS NULL OR TRIM(message) = '' THEN
    RETURN 0;
  END IF;

  -- Never let a caller attach a notification to a board they cannot see
  IF board_id IS NOT NULL AND NOT public.can_access_board(board_id) THEN
    RAISE EXCEPTION 'Access denied for board %', board_id;
  END IF;

  WITH allowed AS (
    SELECT DISTINCT r.id
      FROM unnest(recipient_ids) AS r(id)
     WHERE r.id <> auth.uid()
       AND (
         EXISTS (
           SELECT 1 FROM public.workspace_members me
             JOIN public.workspace_members them
               ON them.workspace_id = me.workspace_id
            WHERE me.user_id = auth.uid() AND them.user_id = r.id
         )
         OR EXISTS (
           SELECT 1 FROM public.board_members me
             JOIN public.board_members them
               ON them.board_id = me.board_id
            WHERE me.user_id = auth.uid() AND them.user_id = r.id
         )
         -- a board grant on one side and workspace membership on the other
         OR EXISTS (
           SELECT 1 FROM public.board_members bm
             JOIN public.boards b ON b.id = bm.board_id
             JOIN public.workspace_members wm ON wm.workspace_id = b.workspace_id
            WHERE (bm.user_id = auth.uid() AND wm.user_id = r.id)
               OR (bm.user_id = r.id AND wm.user_id = auth.uid())
         )
       )
  )
  INSERT INTO public.notifications (user_id, message, board_id, item_id)
  SELECT a.id, message, board_id, item_id FROM allowed a;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_users(UUID[], TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_users(UUID[], TEXT, UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Signup: profile, private personal workspace, and admin notification
--
-- All in one SECURITY DEFINER trigger so the client needs no privileges.
-- Every statement is defensive: a failure here aborts the auth.users insert and
-- takes signup down for everyone, which is exactly what happened between
-- 2026-07-25 and 2026-08-17.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  display_name TEXT;
  new_ws_id    UUID;
BEGIN
  display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, avatar_initials, color, role)
  VALUES (
    NEW.id,
    NEW.email,
    display_name,
    UPPER(SUBSTRING(display_name FROM 1 FOR 2)),
    '#579bfc',
    'member'::user_role
  )
  ON CONFLICT (id) DO NOTHING;

  -- A private personal workspace, so a new user has somewhere of their own
  -- before an admin grants them anything.
  BEGIN
    INSERT INTO public.workspaces (name, is_private, created_by)
    VALUES ('My Workspace', true, NEW.id)
    RETURNING id INTO new_ws_id;

    INSERT INTO public.workspace_members (user_id, workspace_id, role)
    VALUES (NEW.id, new_ws_id, 'admin'::user_role)
    ON CONFLICT (user_id, workspace_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Never let this cost the user their account
    RAISE WARNING 'handle_new_user: personal workspace failed for %: %', NEW.id, SQLERRM;
  END;

  BEGIN
    INSERT INTO public.notifications (user_id, message)
    SELECT a.id,
           format('New user %s has signed up and is waiting for workspace access.', display_name)
      FROM public.profiles a
     WHERE a.role = 'admin' AND a.id <> NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: admin notification failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. request_workspace_access(): replaces the client reading every admin row
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_workspace_access(note TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requester_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT COALESCE(full_name, 'A user') INTO requester_name
    FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.notifications (user_id, message)
  SELECT a.id,
         format('%s is requesting access to a workspace.%s',
                requester_name,
                CASE WHEN NULLIF(TRIM(COALESCE(note, '')), '') IS NULL
                     THEN '' ELSE ' Note: ' || TRIM(note) END)
    FROM public.profiles a
   WHERE a.role = 'admin' AND a.id <> auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.request_workspace_access(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_workspace_access(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Backfill: give existing users their personal workspace
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  u  RECORD;
  ws UUID;
BEGIN
  FOR u IN
    SELECT p.id FROM public.profiles p
     WHERE NOT EXISTS (
       SELECT 1 FROM public.workspaces w
        WHERE w.created_by = p.id AND w.is_private AND w.name = 'My Workspace'
     )
  LOOP
    INSERT INTO public.workspaces (name, is_private, created_by)
    VALUES ('My Workspace', true, u.id)
    RETURNING id INTO ws;

    INSERT INTO public.workspace_members (user_id, workspace_id, role)
    VALUES (u.id, ws, 'admin'::user_role)
    ON CONFLICT (user_id, workspace_id) DO NOTHING;
  END LOOP;
END $$;

COMMIT;
