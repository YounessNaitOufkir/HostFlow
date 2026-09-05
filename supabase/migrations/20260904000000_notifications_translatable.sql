-- Applied via the Supabase API on 2026-09-04; kept here so the schema history
-- is complete and a fresh environment builds the same shape.
--
-- A notification stored a finished sentence, rendered in whatever language the
-- WRITER was using. notify_users takes a recipient list and one string, so a
-- French colleague mentioning an English one wrote French into their bell, and
-- switching your own language left every past notification in the old one.
--
-- The sentence is now stored as a key plus its values and rendered when read,
-- in the reader's language, at the moment they read it. `message` stays: the
-- rows written before this have no key, and it is still the fallback for
-- anything the client cannot translate.

alter table public.notifications
  add column if not exists message_key text,
  add column if not exists message_vars jsonb not null default '{}'::jsonb;

comment on column public.notifications.message_key is
  'i18n key for the sentence. NULL on rows written before notifications were translatable; those fall back to `message`.';
comment on column public.notifications.message_vars is
  'Values interpolated into message_key, e.g. {"actor":"Amine","item":"Kickoff"}. User data - rendered as text, never as markup.';
comment on column public.notifications.message is
  'The rendered sentence. Written for every row so a reader that cannot resolve message_key still shows something; the source of truth once message_key is set is the key.';

-- Same authorisation as notify_users, with the key and vars carried through.
-- Kept as a separate function rather than a changed signature so the existing
-- one stays callable while anything still uses it.
create or replace function public.notify_users_i18n(
  recipient_ids uuid[],
  message_key   text,
  message_vars  jsonb default '{}'::jsonb,
  fallback      text default '',
  board_id      uuid default null,
  item_id       uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
         exists (
           select 1 from public.workspace_members me
             join public.workspace_members them
               on them.workspace_id = me.workspace_id
            where me.user_id = auth.uid() and them.user_id = r.id
         )
         or exists (
           select 1 from public.board_members me
             join public.board_members them
               on them.board_id = me.board_id
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
  insert into public.notifications (user_id, message, message_key, message_vars, board_id, item_id)
  select a.id, fallback, message_key, coalesce(message_vars, '{}'::jsonb), board_id, item_id
    from allowed a;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.notify_users_i18n(uuid[], text, jsonb, text, uuid, uuid) from public, anon;
grant execute on function public.notify_users_i18n(uuid[], text, jsonb, text, uuid, uuid) to authenticated;
