-- Undo 20261007000000_claude_connector_v2_scopes.sql, back to v1.
--
-- If the APP misbehaves right after the migration (it should not: every new
-- policy is a no-op without a client_id), the scope policies are the suspects -
-- step 1 removes them all at once.

-- 1. Scope policies.
do $$
declare
  t text;
begin
  foreach t in array array['workspaces','boards','groups','items','updates','activity_logs',
    'delay_notes','item_links','automations','board_members','workspace_members',
    'workspace_pins','pending_invitations','notifications','audit_logs','webhooks']
  loop
    execute format('drop policy if exists "AI scope: read" on public.%I', t);
    execute format('drop policy if exists "AI scope: insert" on public.%I', t);
    execute format('drop policy if exists "AI scope: update" on public.%I', t);
    execute format('drop policy if exists "AI scope: delete" on public.%I', t);
  end loop;
end;
$$;
drop policy if exists "AI clients: no file reads" on storage.objects;

-- 2. The v1 gate (no item_links, merge or idempotency writes; GET rpc open).
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
  if v_method in ('GET', 'HEAD') then
    return;
  end if;
  if v_method = 'POST' and v_target in (
    'items', 'updates', 'activity_logs', 'groups',
    'rpc/automations_for_board', 'rpc/notify_users_i18n'
  ) then
    return;
  end if;
  if v_method = 'PATCH' and v_target = 'items' then
    return;
  end if;
  raise exception 'An AI assistant is not allowed to do that in HostFlow (% %).', v_method, v_target
    using errcode = '42501', hint = 'hostflow-ai-gate';
end;
$$;

-- 3. notify_users_i18n as it was before v2 (it calls ai_request(), which
--    step 4 drops, so this must come first).
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

-- 4. Tables and functions.
drop function if exists public.agent_finish_request(text, text, jsonb);
drop function if exists public.agent_claim_request(text, text, text);
drop table if exists public.agent_requests;
drop function if exists public.ai_item_ok(uuid, boolean);
drop function if exists public.ai_board_ok(uuid, boolean);
drop function if exists public.ai_workspace_ok(uuid, boolean);
drop function if exists public.ai_request();
drop table if exists public.ai_workspace_scopes;

notify pgrst, 'reload schema';
