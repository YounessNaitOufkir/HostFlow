BEGIN;

-- ---------------------------------------------------------------------------
-- request_workspace_access() sent a fresh round of admin notifications on
-- every call with no memory of a prior one, so a new user tapping the button
-- twice (or refreshing and tapping again) spammed every admin once per tap.
-- access_requested_at is the one-time gate: set on the first successful
-- request, checked before any notification is sent on every call after.
--
-- It only ever clears when the requester leaves the no-workspace screen for
-- good (an admin adds them to a workspace, so EmptyState stops rendering) or
-- is removed from every workspace again, which is exactly workspace_members
-- going from zero rows to one and back to zero for that user — see the
-- trigger below.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_requested_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.request_workspace_access(note TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requester_name TEXT;
  already_requested TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT access_requested_at INTO already_requested
    FROM public.profiles WHERE id = auth.uid();

  IF already_requested IS NOT NULL THEN
    RAISE EXCEPTION 'Access already requested.';
  END IF;

  SELECT COALESCE(full_name, 'A user') INTO requester_name
    FROM public.profiles WHERE id = auth.uid();

  UPDATE public.profiles SET access_requested_at = now() WHERE id = auth.uid();

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

-- Clears the gate the moment the requester has somewhere to work: an admin
-- granting them a shared workspace and them creating their own private one
-- both insert a workspace_members row, and either way EmptyState stops
-- rendering for them, so there is no stale-flag case to also handle on
-- removal — if they end up workspace-less again later the flag is already
-- clear and a genuine new request just works.
CREATE OR REPLACE FUNCTION public.clear_access_request_on_membership_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
     SET access_requested_at = NULL
   WHERE id = NEW.user_id
     AND access_requested_at IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_access_request_on_membership_grant ON public.workspace_members;
CREATE TRIGGER clear_access_request_on_membership_grant
AFTER INSERT ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.clear_access_request_on_membership_grant();

COMMIT;
