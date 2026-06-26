-- Create a new storage bucket for attachments
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for the attachments bucket
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'attachments' );

create policy "Authenticated users can upload attachments"
  on storage.objects for insert
  with check ( bucket_id = 'attachments' and auth.role() = 'authenticated' );

create policy "Users can update their own attachments"
  on storage.objects for update
  using ( bucket_id = 'attachments' and auth.uid() = owner );

create policy "Users can delete their own attachments"
  on storage.objects for delete
  using ( bucket_id = 'attachments' and auth.uid() = owner );
