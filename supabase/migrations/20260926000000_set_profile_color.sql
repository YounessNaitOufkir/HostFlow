-- Admins choose each person's colour.
--
-- A person's colour paints their Gantt bars when a chart is coloured by
-- assignee, and fills their avatar when they have no photo. Every account was
-- created with the same default blue, so on a shared board everyone looked the
-- same; administrators now choose.
--
-- Profiles are updatable by their owner only ("Profiles: Update own"), which
-- is right for everything else on the row. Rather than widen that policy, this
-- mirrors set_user_role: a SECURITY DEFINER function that checks the caller is
-- a global admin and writes the one column.
--
-- NULL clears the choice, and the app falls back to an automatic colour.
-- Anything else must be a plain #RRGGBB: the value is written into style
-- attributes and exported SVG, so free text is refused here, not escaped later.

CREATE OR REPLACE FUNCTION public.set_profile_color(target_user_id uuid, new_color text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can choose colours.';
  END IF;

  IF new_color IS NOT NULL AND new_color !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'A colour must be written as #RRGGBB.';
  END IF;

  UPDATE public.profiles SET color = lower(new_color) WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such person.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_color(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_profile_color(uuid, text) TO authenticated;
