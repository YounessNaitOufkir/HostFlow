-- Secure Attachments Bucket
UPDATE storage.buckets SET public = false WHERE id = 'attachments';

-- Drop existing policies if any
DROP POLICY IF EXISTS "Attachments: Select" ON storage.objects;
DROP POLICY IF EXISTS "Attachments: Insert" ON storage.objects;
DROP POLICY IF EXISTS "Attachments: Delete" ON storage.objects;

-- Create secure policies
-- (Assuming attachments store board_id or workspace_id in their path or metadata. If not, we allow authenticated users to read for now, but restrict insert to auth.uid).
CREATE POLICY "Attachments: Select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'attachments');
CREATE POLICY "Attachments: Insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attachments' AND owner = auth.uid());
CREATE POLICY "Attachments: Delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'attachments' AND owner = auth.uid());
