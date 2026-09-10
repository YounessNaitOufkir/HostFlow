-- =================================================================================
-- Audit trail: snapshot the item name at write time, and stream inserts live.
-- =================================================================================
--
-- ActivityLog.tsx resolved the item name through an items(name) join, which
-- returns NULL once the 30-day trash purge nulls audit_logs.item_id -- so a
-- purged item's history showed "a deleted item" instead of its real name.
-- Capture item.name into the row itself at the moment the trigger fires, and
-- render from that column alone.
--
-- Also add audit_logs to the supabase_realtime publication so the admin feed
-- updates on INSERT without a manual refresh. RLS on the table
-- (is_global_admin() AND can_access_board) is enforced for realtime too, so
-- only admins who can reach the board receive the event.
-- =================================================================================

BEGIN;

ALTER TABLE public.audit_logs ADD COLUMN item_name_snapshot TEXT;

-- Backfill: every existing row still has a live item (0 orphaned at write
-- time), with the create/delete/restore payloads as a fallback.
UPDATE public.audit_logs a
SET item_name_snapshot = COALESCE(
  (SELECT i.name FROM public.items i WHERE i.id = a.item_id),
  a.old_value ->> 'name',
  a.new_value ->> 'name'
);

CREATE OR REPLACE FUNCTION public.audit_items_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_logs (board_id, item_id, user_id, action_type, old_value, new_value, item_name_snapshot)
  VALUES (NEW.board_id, NEW.id, auth.uid(), 'item_created', NULL, jsonb_build_object('name', NEW.name), NEW.name);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_items_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
            jsonb_build_object('column', col.title, 'value', old_val),
            jsonb_build_object('column', col.title, 'value', new_val),
            NEW.name
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_items_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_items_update() FROM PUBLIC, anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

COMMIT;
