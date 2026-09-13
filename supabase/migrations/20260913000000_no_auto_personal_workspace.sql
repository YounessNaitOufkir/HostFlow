-- ---------------------------------------------------------------------------
-- Stop creating a personal workspace at signup.
--
-- Since 20260818000002, handle_new_user() has given every new account a private
-- "My Workspace". The intent was that nobody lands on an empty app — but the
-- effect is that nobody lands on the screen that explains their options. A new
-- signup was dropped straight into a usable workspace and started working in
-- it, never learning that Host'lik's shared workspaces exist or that access to
-- them is something you ask an admin for.
--
-- Without the auto-workspace, a new account reaches no workspace at all, which
-- renders components/EmptyState.tsx: "Let's make you a workspace" as the
-- primary action, and a request-access link that names Host'lik explicitly. The
-- user now makes that choice knowingly instead of having it made for them.
--
-- Creating a workspace by hand is not a privilege: "Workspaces: Insert" (see
-- 20260819000001_staff_ceiling.sql) already permits any authenticated account
-- to insert one, as long as it is private and created_by is themselves.
--
-- Everything else in the trigger is preserved verbatim: the profile row, the
-- admin notification, and the defensive per-block exception handling that
-- exists because a failure here aborts the auth.users insert and takes signup
-- down for everyone.
--
-- Existing "My Workspace" rows are deliberately left alone. They hold real work
-- for anyone who has used one, and this migration is not the place to decide
-- that an empty one is disposable.
-- ---------------------------------------------------------------------------

BEGIN;

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

  -- No personal workspace here on purpose. See the header.
  --
  -- An INVITED user is unaffected: redeem_pending_invitations() fires on the
  -- profiles insert above and grants their workspace_members row, so they still
  -- arrive inside the workspace they were invited to.

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

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
