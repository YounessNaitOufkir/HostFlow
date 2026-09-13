-- ---------------------------------------------------------------------------
-- Let an admin's "someone needs access" notifications click through to the
-- exact place that grants it, instead of just naming the person in text.
--
-- Both notifications this touches - a new signup waiting for a workspace, and
-- an existing user asking for one - are written for admins only (see the
-- `WHERE a.role = 'admin'` / staff-only recipient list in each function below)
-- and both name the person who needs something in plain text with no id
-- attached, so the client had nothing to route on. `related_user_id` gives it
-- one: the admin panel opens straight to Settings > Users > Permissions with
-- that person already selected.
--
-- Piggybacks the same trip to also translate these two sentences, which were
-- the last hardcoded-English strings left after this week's bilingual-funnel
-- work - written with plain `message` rather than the message_key/message_vars
-- pair every other notification already uses (see
-- 20260904000000_notifications_translatable.sql).
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.notifications.related_user_id IS
  'The account this notification is ABOUT (a signup or an access request), not who receives it. Lets the client route a click straight to that person in the admin panel.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  display_name TEXT;
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

  -- No personal workspace here on purpose - see 20260913000000. An INVITED
  -- user is unaffected: redeem_pending_invitations() fires on the profiles
  -- insert above and grants their workspace_members row, so they still arrive
  -- inside the workspace they were invited to.

  BEGIN
    INSERT INTO public.notifications (user_id, message, message_key, message_vars, related_user_id)
    SELECT a.id,
           format('New user %s has signed up and is waiting for workspace access.', display_name),
           'notif.newUserSignedUp',
           jsonb_build_object('name', display_name),
           NEW.id
      FROM public.profiles a
     WHERE a.role = 'admin' AND a.id <> NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: admin notification failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

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

  INSERT INTO public.notifications (user_id, message, message_key, message_vars, related_user_id)
  SELECT a.id,
         format('%s is requesting access to a workspace.%s',
                requester_name,
                CASE WHEN NULLIF(TRIM(COALESCE(note, '')), '') IS NULL
                     THEN '' ELSE ' Note: ' || TRIM(note) END),
         'notif.workspaceAccessRequest',
         jsonb_build_object('name', requester_name),
         auth.uid()
    FROM public.profiles a
   WHERE a.role = 'admin' AND a.id <> auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_workspace_access(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_workspace_access(TEXT) TO authenticated;

COMMIT;
