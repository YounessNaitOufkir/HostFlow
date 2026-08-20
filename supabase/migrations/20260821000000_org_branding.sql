-- =================================================================================
-- Company branding: a logo the admin can actually upload
-- =================================================================================
--
-- organization_settings.logo_url has existed since 20260725000000 and has never had
-- a control anywhere in the app, so it has always been NULL. This gives it somewhere
-- to point.
--
-- A dedicated bucket rather than reusing `avatars`: the company mark is admin-owned
-- org data, not per-user content, and its write policy is therefore role-based
-- rather than owner-based. Public read, because the logo renders in an <img> in the
-- sidebar and signing a URL for a logo buys nothing — it is the company's public
-- identity, not private content.
--
-- Also adds the missing INSERT policy on organization_settings. The table has only
-- ever had SELECT and UPDATE, so the "no settings row yet" branch in
-- AdminSettingsModal was silently unreachable. A row is seeded by 20260725000000, so
-- that branch is cold in practice, but a policy-less path that reports success is
-- exactly the failure mode we are removing from this page.
-- =================================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Branding: Select" ON storage.objects;
DROP POLICY IF EXISTS "Branding: Insert" ON storage.objects;
DROP POLICY IF EXISTS "Branding: Update" ON storage.objects;
DROP POLICY IF EXISTS "Branding: Delete" ON storage.objects;

-- Anyone signed in may read the mark; only a global admin may change it.
CREATE POLICY "Branding: Select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'branding');

CREATE POLICY "Branding: Insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.is_global_admin());

CREATE POLICY "Branding: Update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND public.is_global_admin())
  WITH CHECK (bucket_id = 'branding' AND public.is_global_admin());

CREATE POLICY "Branding: Delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND public.is_global_admin());

-- The settings row is seeded, but the insert path should not be a silent no-op.
DROP POLICY IF EXISTS "Settings: Insert" ON public.organization_settings;
CREATE POLICY "Settings: Insert" ON public.organization_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_global_admin());

COMMIT;
