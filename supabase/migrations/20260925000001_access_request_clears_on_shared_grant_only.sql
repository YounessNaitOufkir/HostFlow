BEGIN;

-- ---------------------------------------------------------------------------
-- clear_access_request_on_membership_grant() cleared access_requested_at on
-- ANY workspace_members insert, including a user creating their own private
-- workspace — which is not an access grant, it's the fallback everyone can
-- self-serve. That let the gate clear before Host'lik access was actually
-- granted: request, then create a private workspace while still waiting, and
-- the next "request access" click (now shown persistently in the sidebar,
-- not just the no-workspace screen) would silently fire a second admin
-- notification for the same unresolved request.
--
-- Only a grant into a non-private workspace is a real "you now have
-- somewhere shared to work" event.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_access_request_on_membership_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = NEW.workspace_id AND is_private = false
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
     SET access_requested_at = NULL
   WHERE id = NEW.user_id
     AND access_requested_at IS NOT NULL;
  RETURN NEW;
END;
$$;

COMMIT;
