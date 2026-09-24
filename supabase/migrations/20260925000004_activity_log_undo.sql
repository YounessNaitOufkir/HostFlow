BEGIN;

-- ---------------------------------------------------------------------------
-- Undo from the activity log.
--
-- 1. audit_items_update() now also records the column's id. It recorded only
--    the title, and item values are keyed by id; titles can be renamed or
--    repeated on a board, so a title alone can't say which value to put back.
--    Rebuilt from the live definition (pg_proc); the only change is the
--    added 'column_id' key.
--
-- 2. undo_audit_log(log_id) reverses one entry, atomically:
--    * field / name change  -> put the old value back, but ONLY if the field
--      still holds the value this entry set. If it was changed again since,
--      undoing would silently overwrite newer work, so it refuses instead.
--    * item_created / item_restored -> move to trash (reversible, not a purge)
--    * item_deleted -> restore from trash, if not already purged
--    SECURITY INVOKER, so the item write goes through the caller's own RLS.
--    The write fires the normal audit trigger, so every undo is itself
--    logged (and undoable).
--    Rows logged before (1) have no column_id; they fall back to the title,
--    and only when exactly one column on the board has that title.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_items_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  actor UUID := auth.uid();
  col RECORD;
  old_val JSONB;
  new_val JSONB;
  action TEXT;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (board_id, item_id, user_id, action_type, old_value, new_value, item_name_snapshot)
    VALUES (NEW.board_id, NEW.id, actor, 'item_deleted', jsonb_build_object('name', NEW.name), NULL, NEW.name);
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.audit_logs (board_id, item_id, user_id, action_type, old_value, new_value, item_name_snapshot)
    VALUES (NEW.board_id, NEW.id, actor, 'item_restored', NULL, jsonb_build_object('name', NEW.name), NEW.name);
  END IF;

  IF OLD.name IS DISTINCT FROM NEW.name AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL THEN
    INSERT INTO public.audit_logs (board_id, item_id, user_id, action_type, old_value, new_value, item_name_snapshot)
    VALUES (
      NEW.board_id, NEW.id, actor, 'name_changed',
      jsonb_build_object('column', 'Name', 'value', OLD.name),
      jsonb_build_object('column', 'Name', 'value', NEW.name),
      NEW.name
    );
  END IF;

  IF NEW.column_values IS DISTINCT FROM OLD.column_values THEN
    FOR col IN
      SELECT c.value ->> 'id' AS id, c.value ->> 'title' AS title, c.value ->> 'type' AS type
      FROM public.boards b, jsonb_array_elements(COALESCE(b.columns, '[]'::jsonb)) AS c(value)
      WHERE b.id = NEW.board_id
    LOOP
      old_val := OLD.column_values -> col.id;
      new_val := NEW.column_values -> col.id;
      IF old_val IS DISTINCT FROM new_val THEN
        action := CASE
          WHEN col.type = 'status' THEN 'status_changed'
          WHEN col.type = 'people' THEN 'assignee_changed'
          WHEN col.type = 'priority' THEN 'priority_changed'
          WHEN col.type IN ('date', 'timeline') THEN 'due_date_changed'
          WHEN col.title ~* 'description|d[ée]signation' THEN 'description_changed'
          ELSE NULL
        END;
        IF action IS NOT NULL THEN
          INSERT INTO public.audit_logs (board_id, item_id, user_id, action_type, old_value, new_value, item_name_snapshot)
          VALUES (
            NEW.board_id, NEW.id, actor, action,
            jsonb_build_object('column', col.title, 'column_id', col.id, 'value', old_val),
            jsonb_build_object('column', col.title, 'column_id', col.id, 'value', new_val),
            NEW.name
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.undo_audit_log(log_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  l       public.audit_logs%ROWTYPE;
  it      public.items%ROWTYPE;
  col_id  TEXT;
  matches INT;
  restore JSONB;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Only administrators can undo changes.';
  END IF;

  SELECT * INTO l FROM public.audit_logs WHERE id = log_id;
  IF NOT FOUND OR l.item_id IS NULL THEN
    RETURN 'unavailable';
  END IF;

  SELECT * INTO it FROM public.items WHERE id = l.item_id;
  IF NOT FOUND THEN
    RETURN 'item_gone';          -- purged from the trash
  END IF;

  IF l.action_type IN ('item_created', 'item_restored') THEN
    IF it.deleted_at IS NOT NULL THEN RETURN 'already_undone'; END IF;
    UPDATE public.items SET deleted_at = now() WHERE id = it.id;
    RETURN 'undone';
  ELSIF l.action_type = 'item_deleted' THEN
    IF it.deleted_at IS NULL THEN RETURN 'already_undone'; END IF;
    UPDATE public.items SET deleted_at = NULL WHERE id = it.id;
    RETURN 'undone';
  END IF;

  IF it.deleted_at IS NOT NULL THEN
    RETURN 'item_in_trash';
  END IF;

  IF l.action_type = 'name_changed' THEN
    IF it.name IS DISTINCT FROM (l.new_value ->> 'value') THEN RETURN 'changed_since'; END IF;
    UPDATE public.items SET name = l.old_value ->> 'value' WHERE id = it.id;
    RETURN 'undone';
  END IF;

  col_id := l.new_value ->> 'column_id';
  IF col_id IS NULL THEN
    SELECT count(*), max(c.value ->> 'id') INTO matches, col_id
      FROM public.boards b, jsonb_array_elements(COALESCE(b.columns, '[]'::jsonb)) AS c(value)
     WHERE b.id = it.board_id AND c.value ->> 'title' = l.new_value ->> 'column';
    IF matches <> 1 THEN RETURN 'unavailable'; END IF;
  END IF;

  -- A missing key and a JSON null both mean "empty" here.
  IF COALESCE(it.column_values -> col_id, 'null'::jsonb)
     IS DISTINCT FROM COALESCE(l.new_value -> 'value', 'null'::jsonb) THEN
    RETURN 'changed_since';
  END IF;

  restore := COALESCE(l.old_value -> 'value', 'null'::jsonb);
  UPDATE public.items
     SET column_values = CASE
           WHEN restore = 'null'::jsonb THEN COALESCE(column_values, '{}'::jsonb) - col_id
           ELSE jsonb_set(COALESCE(column_values, '{}'::jsonb), ARRAY[col_id], restore)
         END
   WHERE id = it.id;
  RETURN 'undone';
END;
$$;

REVOKE ALL ON FUNCTION public.undo_audit_log(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_audit_log(UUID) TO authenticated;

COMMIT;
