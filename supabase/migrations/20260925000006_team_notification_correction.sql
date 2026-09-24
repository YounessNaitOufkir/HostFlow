BEGIN;

-- ---------------------------------------------------------------------------
-- Corrects 20260925000003. It assumed Team (is_staff) grants every shared
-- workspace. It doesn't: can_access_workspace_as() makes staff necessary but
-- not sufficient; a Team member still needs a workspace_members row (or a
-- board grant), and only admins see all shared work. So:
--   * the notification no longer claims access was granted;
--   * the pending access request is no longer cleared here. It is answered
--     when the person is actually added to a shared workspace, which
--     clear_access_request_on_membership_grant() already handles (and that
--     grant already notifies them through workspace_members_notify).
-- Built from the live definition; the three guards are unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_user_staff(target_user_id uuid, staff boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  was_staff    BOOLEAN;
  granter_name TEXT;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can change staff status.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND is_owner)
     AND staff = false THEN
    RAISE EXCEPTION 'The platform owner is always a staff member.';
  END IF;

  IF staff = false
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Change this person to Member first. An Administrator cannot be marked External.';
  END IF;

  SELECT COALESCE(is_staff, false) INTO was_staff
    FROM public.profiles WHERE id = target_user_id;

  UPDATE public.profiles SET is_staff = staff WHERE id = target_user_id;

  IF staff AND NOT was_staff AND target_user_id <> auth.uid() THEN
    BEGIN
      SELECT COALESCE(full_name, 'An administrator') INTO granter_name
        FROM public.profiles WHERE id = auth.uid();

      INSERT INTO public.notifications (user_id, message, message_key, message_vars)
      VALUES (
        target_user_id,
        format('%s added you to the Host''lik team.', granter_name),
        'notif.teamAccessGranted',
        jsonb_build_object('name', granter_name)
      );
    EXCEPTION WHEN OTHERS THEN
      -- A notification must never cost somebody their role change.
      RAISE WARNING 'set_user_staff: notification failed for %: %', target_user_id, SQLERRM;
    END;
  END IF;
END;
$function$;

COMMIT;
