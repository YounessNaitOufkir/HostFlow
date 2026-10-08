-- Claude connector v1: the database side.
--
-- The connector (app/api/mcp) acts with a person's own Supabase token, issued
-- by Supabase's OAuth server to an AI client. That token is a real sign-in, so
-- every limit on what an AI client may do lives HERE, not in which tools the
-- route happens to offer. See docs/plans/claude-connector-v1.md.
--
-- How an AI request is told apart: OAuth-issued tokens carry a `client_id`
-- claim; the app's own sessions never do.
--
-- Rollback: supabase/rollbacks/20261006000000_claude_connector_v1_down.sql
-- (the gate alone: `alter role authenticator reset pgrst.db_pre_request;
--  notify pgrst, 'reload config';`).

-- ─── 1. Who may use an AI assistant ─────────────────────────────

alter table public.profiles
  add column if not exists ai_access boolean not null default false;

comment on column public.profiles.ai_access is
  'May connect an AI assistant (Claude connector). Admin-set via set_user_ai_access; '
  'checked on every AI-client request by agent_request_gate.';

-- profiles has column-level UPDATE grants only, so this new column is NOT in
-- them: nobody can switch it on for themselves. Only the function below can.

update public.profiles set ai_access = true where is_owner;

/** The ids with AI access on. Empty for anyone who is not an administrator. */
create or replace function public.ai_access_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id from public.profiles p where p.ai_access and public.is_global_admin();
$$;

/**
 * Switch a person's AI access. Returns the value saved, so the caller can
 * confirm it. Switching off also ends that person's AI-client sessions, so the
 * assistant cannot even refresh its token; the gate already refuses it on the
 * very next request either way.
 */
create or replace function public.set_user_ai_access(target_user_id uuid, enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_saved boolean;
begin
  if not public.is_global_admin() then
    raise exception 'Access denied. Only global administrators can change AI access.'
      using errcode = '42501';
  end if;

  update public.profiles set ai_access = enabled
  where id = target_user_id
  returning ai_access into v_saved;

  if not found then
    raise exception 'No such user.';
  end if;

  if not enabled then
    delete from auth.sessions
    where user_id = target_user_id and oauth_client_id is not null;
  end if;

  return v_saved;
end;
$$;

revoke all on function public.ai_access_user_ids() from public, anon;
revoke all on function public.set_user_ai_access(uuid, boolean) from public, anon;
grant execute on function public.ai_access_user_ids() to authenticated;
grant execute on function public.set_user_ai_access(uuid, boolean) to authenticated;

-- ─── 2. "via Claude" for free ───────────────────────────────────
-- Filled from the token by the database, so no code path can forget it.

alter table public.activity_logs
  add column if not exists via_client_id text default (auth.jwt() ->> 'client_id');
alter table public.updates
  add column if not exists via_client_id text default (auth.jwt() ->> 'client_id');

-- ─── 3. The gate: one check before every database API request ───

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

  -- Reads: row-level security decides, exactly as for the person in the app.
  if v_method in ('GET', 'HEAD') then
    return;
  end if;

  -- v1 writes. A new AI permission is one deliberate line here.
  if v_method = 'POST' and v_target in (
    'items',                     -- create a task
    'updates',                   -- post a comment
    'activity_logs',             -- the history line for both
    'groups',                    -- re-make a deleted "Completed" group
    'rpc/automations_for_board', -- read the board's rules (an RPC, so POST)
    'rpc/notify_users_i18n'      -- tell an assignee
  ) then
    return;
  end if;

  if v_method = 'PATCH' and v_target = 'items' then -- change a status
    return;
  end if;

  raise exception 'An AI assistant is not allowed to do that in HostFlow (% %).', v_method, v_target
    using errcode = '42501', hint = 'hostflow-ai-gate';
end;
$$;

grant execute on function public.agent_request_gate() to anon, authenticated;

-- ─── 4. Files have their own API: AI clients write none in v1 ───
-- Restrictive, so these hold whatever the permissive policies allow.

create policy "AI clients: no uploads" on storage.objects
  as restrictive for insert to public
  with check (coalesce(auth.jwt() ->> 'client_id', '') = '');

create policy "AI clients: no file changes" on storage.objects
  as restrictive for update to public
  using (coalesce(auth.jwt() ->> 'client_id', '') = '');

create policy "AI clients: no file deletes" on storage.objects
  as restrictive for delete to public
  using (coalesce(auth.jwt() ->> 'client_id', '') = '');

-- ─── 5. Switch the gate on (last, once everything it reads exists) ───

alter role authenticator set pgrst.db_pre_request = 'public.agent_request_gate';
notify pgrst, 'reload config';
