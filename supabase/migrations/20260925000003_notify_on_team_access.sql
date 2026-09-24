BEGIN;

-- ---------------------------------------------------------------------------
-- Switching someone from External to Team in User Roles is how an admin
-- answers an access request: Team sees every shared workspace without a
-- workspace_members row. But unlike the workspace/board grants (whose
-- triggers notify the grantee), this path sent nothing, so the person who
-- asked never learned they'd been let in.
--
-- Built from the live definition of set_user_staff (pg_proc), so its three
-- guards are unchanged. Added, only on an actual External -> Team change:
--   * an in-app notification to that person
--   * clearing their pending access request, which is now answered
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

  IF staff AND NOT was_staff THEN
    UPDATE public.profiles
       SET access_requested_at = NULL
     WHERE id = target_user_id AND access_requested_at IS NOT NULL;

    IF target_user_id <> auth.uid() THEN
      BEGIN
        SELECT COALESCE(full_name, 'An administrator') INTO granter_name
          FROM public.profiles WHERE id = auth.uid();

        INSERT INTO public.notifications (user_id, message, message_key, message_vars)
        VALUES (
          target_user_id,
          format('%s added you to the team. You now have access to the shared workspaces.', granter_name),
          'notif.teamAccessGranted',
          jsonb_build_object('name', granter_name)
        );
      EXCEPTION WHEN OTHERS THEN
        -- A notification must never cost somebody their access grant.
        RAISE WARNING 'set_user_staff: notification failed for %: %', target_user_id, SQLERRM;
      END;
    END IF;
  END IF;
END;
$function$;

COMMIT;
