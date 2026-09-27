-- Live names and colours: tell colleagues when someone's public details change.
--
-- Names, initials, photos and colours reach other people through the
-- user_directory view, which decides who can see whom. A view cannot be
-- broadcast, and profiles itself is readable only by its owner, so Realtime
-- told nobody else when someone renamed themselves or picked a new colour -
-- it showed after a reload.
--
-- directory_changes holds one row per person: who changed, and when. Nothing
-- private is in it. Its select policy is the directory's own visibility rule,
-- so Realtime sends the signal only to people who can already see that person
-- in user_directory, and the app refreshes names when it arrives.

CREATE TABLE IF NOT EXISTS public.directory_changes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.directory_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "DirectoryChanges: Select" ON public.directory_changes;
CREATE POLICY "DirectoryChanges: Select" ON public.directory_changes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_directory d WHERE d.id = directory_changes.user_id));

-- Written only by the trigger below.
REVOKE ALL ON public.directory_changes FROM anon, authenticated;
GRANT SELECT ON public.directory_changes TO authenticated;

CREATE OR REPLACE FUNCTION public.record_directory_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.directory_changes (user_id, changed_at)
  VALUES (NEW.id, now())
  ON CONFLICT (user_id) DO UPDATE SET changed_at = EXCLUDED.changed_at;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_directory_change() FROM PUBLIC, anon, authenticated;

-- Only the columns user_directory shows: a change to anything else (language,
-- notification settings) is nobody else's business and sends nothing.
DROP TRIGGER IF EXISTS record_directory_change ON public.profiles;
CREATE TRIGGER record_directory_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (
    OLD.full_name IS DISTINCT FROM NEW.full_name
    OR OLD.avatar_initials IS DISTINCT FROM NEW.avatar_initials
    OR OLD.avatar_url IS DISTINCT FROM NEW.avatar_url
    OR OLD.color IS DISTINCT FROM NEW.color
    OR OLD.role IS DISTINCT FROM NEW.role
    OR OLD.is_staff IS DISTINCT FROM NEW.is_staff
  )
  EXECUTE FUNCTION public.record_directory_change();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'directory_changes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.directory_changes;
  END IF;
END $$;
