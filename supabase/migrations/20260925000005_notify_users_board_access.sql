BEGIN;

-- ---------------------------------------------------------------------------
-- notify_users() / notify_users_i18n() only let a notification through when
-- sender and recipient shared an explicit workspace_members or board_members
-- row. Team (is_staff) access to shared workspaces has no such rows, on
-- either side, so on shared boards nearly every recipient was filtered out
-- and the function returned 0 without complaint:
--   * task-assignment alerts: none since 2026-09-09
--   * @mention alerts: none, ever
--
-- When the notification is about a board, the right question is simply
-- whether the recipient can see that board, which can_access_board_as()
-- already answers (Team access included). Without a board, the old
-- shared-membership rule is kept. Both rebuilt from their live definitions;
-- everything else is unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_users(recipient_ids uuid[], message text, board_id uuid DEFAULT NULL::uuid, item_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF message IS NULL OR TRIM(message) = '' THEN
    RETURN 0;
  END IF;

  -- Never let a caller attach a notification to a board they cannot see
  IF board_id IS NOT NULL AND NOT public.can_access_board(board_id) THEN
    RAISE EXCEPTION 'Access denied for board %', board_id;
  END IF;

  WITH allowed AS (
    SELECT DISTINCT r.id
      FROM unnest(recipient_ids) AS r(id)
     WHERE r.id <> auth.uid()
       AND (
         (notify_users.board_id IS NOT NULL AND public.can_access_board_as(r.id, notify_users.board_id))
         OR (
           notify_users.board_id IS NULL AND (
             EXISTS (
               SELECT 1 FROM public.workspace_members me
                 JOIN public.workspace_members them ON them.workspace_id = me.workspace_id
                WHERE me.user_id = auth.uid() AND them.user_id = r.id
             )
             OR EXISTS (
               SELECT 1 FROM public.board_members me
                 JOIN public.board_members them ON them.board_id = me.board_id
                WHERE me.user_id = auth.uid() AND them.user_id = r.id
             )
             OR EXISTS (
               SELECT 1 FROM public.board_members bm
                 JOIN public.boards b ON b.id = bm.board_id
                 JOIN public.workspace_members wm ON wm.workspace_id = b.workspace_id
                WHERE (bm.user_id = auth.uid() AND wm.user_id = r.id)
                   OR (bm.user_id = r.id AND wm.user_id = auth.uid())
             )
           )
         )
       )
  )
  INSERT INTO public.notifications (user_id, message, board_id, item_id)
  SELECT a.id, message, notify_users.board_id, notify_users.item_id FROM allowed a;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_users_i18n(recipient_ids uuid[], message_key text, message_vars jsonb DEFAULT '{}'::jsonb, fallback text DEFAULT ''::text, board_id uuid DEFAULT NULL::uuid, item_id uuid DEFAULT NULL::uuid)
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

COMMIT;
