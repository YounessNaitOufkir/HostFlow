create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  trigger_column_id text not null,
  trigger_value text not null,
  action_type text not null, -- e.g., 'move_group'
  action_target_id text not null, -- e.g., group_id to move to
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on RLS
alter table automations enable row level security;

-- Policies
create policy "Users can view automations for their workspaces"
  on automations for select
  using (
    board_id in (
      select b.id from boards b
      join workspaces w on w.id = b.workspace_id
    )
  );

create policy "Users can create automations"
  on automations for insert
  with check (auth.role() = 'authenticated');

create policy "Users can delete automations"
  on automations for delete
  using (auth.role() = 'authenticated');
