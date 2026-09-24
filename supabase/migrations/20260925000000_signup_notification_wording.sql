BEGIN;

-- ---------------------------------------------------------------------------
-- handle_new_user()'s admin notification said "has signed up and is waiting
-- for workspace access" for every signup, which reads as a request nobody
-- actually made — only request_workspace_access() (a separate, explicit
-- click) is an access request. Wording only; the trigger still fires once per
-- signup and request_workspace_access() is untouched.
-- ---------------------------------------------------------------------------

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
           format('New user %s has signed up.', display_name),
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

COMMIT;
