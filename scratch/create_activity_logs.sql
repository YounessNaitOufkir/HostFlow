create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade not null,
  board_id uuid references boards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  action text not null, -- e.g., 'Status changed from Working to Done'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS to ensure PRIVATE logs
alter table activity_logs enable row level security;

-- CRITICAL POLICY: Only the user who created the log can see it.
-- This fulfills the requirement: "I want to be the only person who can access it."
create policy "Users can only view their own activity logs"
  on activity_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own activity logs"
  on activity_logs for insert
  with check (auth.uid() = user_id);
