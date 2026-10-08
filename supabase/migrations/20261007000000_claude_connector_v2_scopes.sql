-- Claude connector v2: per-workspace AI scopes, idempotent writes, and the
-- gate's wider (but still explicit) write list. See docs/plans/claude-connector-v2.md.
--
-- Everything here only ever narrows what an AI client (a token carrying a
-- client_id claim) can do. The app's own traffic is untouched: every new
-- policy starts with `not ai_request()`, which is evaluated once per query.
--
-- Consequence, decided: a person with no scope rows reaches NOTHING through an
-- assistant until they tick workspaces in Profile settings › AI assistant.
--
-- Rollback: supabase/rollbacks/20261007000000_claude_connector_v2_scopes_down.sql

-- ─── 1. Who chose what ──────────────────────────────────────────

create table if not exists public.ai_workspace_scopes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  can_read boolean not null default true,
  can_write boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace_id),
  constraint ai_scope_write_implies_read check (not can_write or can_read)
);

comment on table public.ai_workspace_scopes is
  'Per person: which workspaces their AI assistant may read / write. Set by the person '
  'in Profile settings. Enforced by the AI scope policies on every content table.';

alter table public.ai_workspace_scopes enable row level security;
grant select, insert, update, delete on public.ai_workspace_scopes to authenticated;

create policy "AI scopes: own rows" on public.ai_workspace_scopes
  for select to authenticated using (user_id = auth.uid());
create policy "AI scopes: add for a workspace I can open" on public.ai_workspace_scopes
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_workspace(workspace_id));
create policy "AI scopes: change own" on public.ai_workspace_scopes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_workspace(workspace_id));
create policy "AI scopes: remove own" on public.ai_workspace_scopes
  for delete to authenticated using (user_id = auth.uid());

-- ─── 2. The scope questions the policies ask ────────────────────

/** True when this request comes from an AI client (an OAuth token with client_id). */
create or replace function public.ai_request()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'client_id', '') <> '';
$$;

create or replace function public.ai_workspace_ok(p_workspace_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.ai_workspace_scopes s
     where s.user_id = auth.uid()
       and s.workspace_id = p_workspace_id
       and s.can_read
       and (not p_write or s.can_write)
  );
$$;

create or replace function public.ai_board_ok(p_board_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.ai_workspace_ok((select b.workspace_id from public.boards b where b.id = p_board_id), p_write);
$$;

create or replace function public.ai_item_ok(p_item_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.ai_board_ok((select i.board_id from public.items i where i.id = p_item_id), p_write);
$$;

grant execute on function public.ai_request() to anon, authenticated;
grant execute on function public.ai_workspace_ok(uuid, boolean) to authenticated;
grant execute on function public.ai_board_ok(uuid, boolean) to authenticated;
grant execute on function public.ai_item_ok(uuid, boolean) to authenticated;

-- ─── 3. Scope policies on every table that holds workspace content ──
-- Restrictive: they hold whatever the existing permissive policies allow.
-- %1$s is the read check, %2$s the write check, both over the row's columns.

do $$
declare
  rule record;
begin
  for rule in
    select * from (values
      ('workspaces',          'public.ai_workspace_ok(id, false)',            'public.ai_workspace_ok(id, true)'),
      ('boards',              'public.ai_workspace_ok(workspace_id, false)',  'public.ai_workspace_ok(workspace_id, true)'),
      ('groups',              'public.ai_board_ok(board_id, false)',          'public.ai_board_ok(board_id, true)'),
      ('items',               'public.ai_board_ok(board_id, false)',          'public.ai_board_ok(board_id, true)'),
      ('updates',             'public.ai_item_ok(item_id, false)',            'public.ai_item_ok(item_id, true)'),
      ('activity_logs',       'public.ai_board_ok(board_id, false)',          'public.ai_board_ok(board_id, true)'),
      ('delay_notes',         'public.ai_board_ok(board_id, false)',          'public.ai_board_ok(board_id, true)'),
      ('item_links',          'public.ai_item_ok(source_item_id, false) and public.ai_item_ok(target_item_id, false)',
                              'public.ai_item_ok(source_item_id, true) and public.ai_item_ok(target_item_id, true)'),
      ('automations',         'case when board_id is not null then public.ai_board_ok(board_id, false) else public.ai_workspace_ok(workspace_id, false) end',
                              'case when board_id is not null then public.ai_board_ok(board_id, true) else public.ai_workspace_ok(workspace_id, true) end'),
      ('board_members',       'public.ai_board_ok(board_id, false)',          'public.ai_board_ok(board_id, true)'),
      ('workspace_members',   'public.ai_workspace_ok(workspace_id, false)',  'public.ai_workspace_ok(workspace_id, true)'),
      ('workspace_pins',      'public.ai_workspace_ok(workspace_id, false)',  'public.ai_workspace_ok(workspace_id, true)'),
      ('pending_invitations', 'public.ai_workspace_ok(workspace_id, false)',  'public.ai_workspace_ok(workspace_id, true)'),
      ('notifications',       '(board_id is null or public.ai_board_ok(board_id, false))',
                              '(board_id is null or public.ai_board_ok(board_id, true))'),
      ('audit_logs',          'false',                                        'false'),
      ('webhooks',            'false',                                        'false')
    ) as t(tbl, read_check, write_check)
  loop
    execute format(
      'create policy "AI scope: read" on public.%I as restrictive for select to public
         using (not (select public.ai_request()) or (%s))',
      rule.tbl, rule.read_check);
    execute format(
      'create policy "AI scope: insert" on public.%I as restrictive for insert to public
         with check (not (select public.ai_request()) or (%s))',
      rule.tbl, rule.write_check);
    execute format(
      'create policy "AI scope: update" on public.%I as restrictive for update to public
         using (not (select public.ai_request()) or (%s))
         with check (not (select public.ai_request()) or (%s))',
      rule.tbl, rule.write_check, rule.write_check);
    execute format(
      'create policy "AI scope: delete" on public.%I as restrictive for delete to public
         using (not (select public.ai_request()) or (%s))',
      rule.tbl, rule.write_check);
  end loop;
end;
$$;

-- Files: v2 has no file tools, so AI clients read none either.
create policy "AI clients: no file reads" on storage.objects
  as restrictive for select to public
  using (coalesce(auth.jwt() ->> 'client_id', '') = '');

-- ─── 4. Notifications from an AI client: only about boards it may write ──
-- Rewritten from the live definition (2026-10-06); the only change is the
-- AI check after the board access check.

create or replace function public.notify_users_i18n(recipient_ids uuid[], message_key text, message_vars jsonb DEFAULT '{}'::jsonb, fallback text DEFAULT ''::text, board_id uuid DEFAULT NULL::uuid, item_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  inserted integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if message_key is null or trim(message_key) = '' then
    return 0;
  end if;

  if board_id is not null and not public.can_access_board(board_id) then
    raise exception 'Access denied for board %', board_id;
  end if;

  if public.ai_request() and (board_id is null or not public.ai_board_ok(board_id, true)) then
    raise exception 'An AI assistant can only notify people about boards it may write to.'
      using errcode = '42501', hint = 'hostflow-ai-gate';
  end if;

  with allowed as (
    select distinct r.id
      from unnest(recipient_ids) as r(id)
     where r.id <> auth.uid()
       and (
         (notify_users_i18n.board_id is not null and public.can_access_board_as(r.id, notify_users_i18n.board_id))
         or (
           notify_users_i18n.board_id is null and (
             exists (
               select 1 from public.workspace_members me
                 join public.workspace_members them on them.workspace_id = me.workspace_id
                where me.user_id = auth.uid() and them.user_id = r.id
             )
             or exists (
               select 1 from public.board_members me
                 join public.board_members them on them.board_id = me.board_id
                where me.user_id = auth.uid() and them.user_id = r.id
             )
             or exists (
               select 1 from public.board_members bm
                 join public.boards b on b.id = bm.board_id
                 join public.workspace_members wm on wm.workspace_id = b.workspace_id
                where (bm.user_id = auth.uid() and wm.user_id = r.id)
                   or (bm.user_id = r.id and wm.user_id = auth.uid())
             )
           )
         )
       )
  )
  insert into public.notifications (user_id, message, message_key, message_vars, board_id, item_id)
  select a.id, fallback, notify_users_i18n.message_key, coalesce(notify_users_i18n.message_vars, '{}'::jsonb),
         notify_users_i18n.board_id, notify_users_i18n.item_id
    from allowed a;

  get diagnostics inserted = row_count;
  return inserted;
end;
$function$;

-- ─── 5. Idempotent writes ───────────────────────────────────────

create table if not exists public.agent_requests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_key text not null check (length(request_key) between 1 and 200),
  tool text not null,
  payload_hash text not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, request_key)
);

comment on table public.agent_requests is
  'One row per AI write request_id, so a retried request returns the first result '
  'instead of writing twice. Reached only through agent_claim_request / agent_finish_request.';

alter table public.agent_requests enable row level security;
revoke all on public.agent_requests from anon, authenticated;

/**
 * Claim a request id before writing. Answers one of:
 *   {"claimed": true}            go ahead and write
 *   {"replay": <result>}         already done: return this, write nothing
 *   {"running": true}            the first attempt is still in progress
 *   {"conflict": true}           this id was used for a different request
 * A failed or abandoned (2 min) attempt can be claimed again.
 */
create or replace function public.agent_claim_request(p_key text, p_tool text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.agent_requests;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  insert into public.agent_requests (user_id, request_key, tool, payload_hash)
  values (auth.uid(), p_key, p_tool, p_hash)
  on conflict (user_id, request_key) do nothing;
  if found then
    return jsonb_build_object('claimed', true);
  end if;

  select * into v_row from public.agent_requests
   where user_id = auth.uid() and request_key = p_key
   for update;

  if v_row.tool <> p_tool or v_row.payload_hash <> p_hash then
    return jsonb_build_object('conflict', true);
  end if;
  if v_row.status = 'done' then
    return jsonb_build_object('replay', v_row.result);
  end if;
  if v_row.status = 'running' and v_row.updated_at > now() - interval '2 minutes' then
    return jsonb_build_object('running', true);
  end if;

  update public.agent_requests
     set status = 'running', updated_at = now()
   where user_id = auth.uid() and request_key = p_key;
  return jsonb_build_object('claimed', true);
end;
$$;

create or replace function public.agent_finish_request(p_key text, p_status text, p_result jsonb)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.agent_requests
     set status = p_status, result = p_result, updated_at = now()
   where user_id = auth.uid() and request_key = p_key
     and p_status in ('done', 'failed');
$$;

revoke all on function public.agent_claim_request(text, text, text) from public, anon;
revoke all on function public.agent_finish_request(text, text, jsonb) from public, anon;
grant execute on function public.agent_claim_request(text, text, text) to authenticated;
grant execute on function public.agent_finish_request(text, text, jsonb) to authenticated;

-- ─── 6. The gate, v2 ────────────────────────────────────────────

create or replace function public.agent_request_gate()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_method text;
  v_target text;
begin
  -- The app's own traffic carries no client_id and is never touched.
  -- THIS MUST STAY THE FIRST STATEMENT: anything above it runs on every
  -- request the whole app makes.
  if v_claims is null or coalesce(v_claims ->> 'client_id', '') = '' then
    return;
  end if;

  if not coalesce(
    (select p.ai_access from public.profiles p where p.id = (v_claims ->> 'sub')::uuid),
    false
  ) then
    raise exception 'AI access is off for your HostFlow account. Ask an admin to turn it on.'
      using errcode = '42501', hint = 'hostflow-ai-gate';
  end if;

  v_method := upper(coalesce(current_setting('request.method', true), ''));
  v_target := regexp_replace(coalesce(current_setting('request.path', true), ''), '^/+', '');

  -- Table reads: the AI scope policies and row-level security decide.
  -- Function reads are not open: a stable function could read around them.
  if v_method in ('GET', 'HEAD') and v_target not like 'rpc/%' then
    return;
  end if;

  -- Writes and function calls. A new AI permission is one deliberate line here.
  if v_method = 'POST' and v_target in (
    'items',                      -- create a task or subtask
    'updates',                    -- post a comment
    'activity_logs',              -- the history line for every change
    'groups',                     -- re-make a deleted "Completed" group
    'item_links',                 -- link a subtask to its parent
    'rpc/automations_for_board',  -- read the board's rules
    'rpc/notify_users_i18n',      -- tell an assignee (scope-checked inside)
    'rpc/merge_item_values',      -- change fields without clobbering other edits
    'rpc/agent_claim_request',    -- idempotent writes
    'rpc/agent_finish_request'
  ) then
    return;
  end if;

  if v_method = 'PATCH' and v_target = 'items' then -- status, group, name
    return;
  end if;

  raise exception 'An AI assistant is not allowed to do that in HostFlow (% %).', v_method, v_target
    using errcode = '42501', hint = 'hostflow-ai-gate';
end;
$$;

notify pgrst, 'reload schema';
