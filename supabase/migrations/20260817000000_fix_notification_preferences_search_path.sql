-- =================================================================================
-- Fix: user signup has been failing since 2026-07-25
-- =================================================================================
--
-- Symptom
--   Creating any user (Supabase dashboard, app signup, or admin API) fails with
--   "Database error creating new user". GoTrue returns HTTP 500 with an empty
--   body, so the real cause is only visible in the Postgres logs:
--
--     relation "notification_preferences" does not exist
--
-- Cause
--   20260725000000_comprehensive_settings.sql added this trigger function:
--
--     CREATE OR REPLACE FUNCTION create_notification_preferences()
--     RETURNS TRIGGER AS $$
--     BEGIN
--       INSERT INTO notification_preferences (user_id) VALUES (NEW.id) ...
--
--   It is SECURITY DEFINER, references the table *unqualified*, and pins no
--   search_path. The connection GoTrue uses to insert into auth.users does not
--   carry `public` on its search_path, so the table is invisible to the trigger
--   and the whole INSERT transaction aborts.
--
--   handle_new_user() sits in the same trigger chain and survived only because
--   it happens to qualify its target as `public.profiles`.
--
--   The last successful signup was 2026-07-21, four days before that migration
--   landed, which is why the breakage went unnoticed.
--
-- Fix
--   Qualify the table and pin search_path on both functions in the signup path.
--   Pinning search_path also closes the privilege-escalation vector that any
--   SECURITY DEFINER function with a mutable search_path carries.
-- =================================================================================

CREATE OR REPLACE FUNCTION public.create_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_initials, color)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    UPPER(SUBSTRING(COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) FROM 1 FOR 2)),
    '#579bfc'
  );
  RETURN NEW;
END;
$$;
