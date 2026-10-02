-- Attachments are readable by whoever can open the board they belong to.
--
-- The bucket is private, and its only read policy was "your own uploads", so a
-- picture or PDF in an update was invisible to everyone but its uploader - and
-- to them too, since the app linked it with a public URL a private bucket does
-- not serve. Uploads now go to boards/<board id>/..., signed on display
-- (lib/attachments.ts). The owner-only policies stay: they keep older uploads
-- outside a board folder reachable by whoever uploaded them.

CREATE OR REPLACE FUNCTION public.can_read_attachment(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  -- CASE, not AND: the uuid cast must only run on a well-formed folder name.
  SELECT CASE
    WHEN split_part(object_name, '/', 1) = 'boards'
     AND split_part(object_name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN public.can_access_board(split_part(object_name, '/', 2)::uuid)
    ELSE false
  END;
$$;

DROP POLICY IF EXISTS "Attachments: Read board files" ON storage.objects;
CREATE POLICY "Attachments: Read board files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND public.can_read_attachment(name));

-- Uploading into a board's folder requires being able to open that board.
-- Restrictive, so it narrows the existing permissive insert policies rather
-- than adding another way in; other buckets and paths are untouched.
DROP POLICY IF EXISTS "Attachments: Board folder upload" ON storage.objects;
CREATE POLICY "Attachments: Board folder upload" ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'attachments'
    OR split_part(name, '/', 1) <> 'boards'
    OR public.can_read_attachment(name)
  );
