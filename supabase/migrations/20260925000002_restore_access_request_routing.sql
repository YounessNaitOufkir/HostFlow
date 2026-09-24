BEGIN;

-- ---------------------------------------------------------------------------
-- 20260924000000's dedupe rewrite of request_workspace_access() was based on
-- an older copy of this function and silently dropped message_key,
-- message_vars, and related_user_id — the three columns
-- 20260913000001_notification_user_routing.sql added specifically so a click
-- on this notification jumps straight to Settings > Users > Permissions with
-- the requester preselected, and so it renders translated. The notification
-- fell back to a plain, unclickable message with no regressed functionality
-- announced anywhere, until the admin who receives it noticed it didn't
-- click through. This restores those three columns; the dedupe gate this
-- migration itself added is unchanged.
-- ---------------------------------------------------------------------------

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

COMMIT;
