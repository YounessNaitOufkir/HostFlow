-- =================================================================================
-- Audit trail: item name (title) changes were not detected.
-- =================================================================================
--
-- audit_items_update() diffs column_values against boards.columns, which is
-- where every dynamic field lives -- but an item's name is a fixed column on
-- `items` itself, outside that jsonb, so a title edit produced no audit row
-- at all. Add a name_changed action, formatted the same way a column change
-- is ({ column, value }) so the existing ActivityLog fallback renders it with
-- no new translation needed.
-- =================================================================================

BEGIN;

ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_action_type_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_type_check CHECK (action_type IN (
  'item_created', 'item_deleted', 'item_restored',
  'status_changed', 'assignee_changed', 'priority_changed',
  'due_date_changed', 'description_changed', 'name_changed'
));

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
    INSERT INTO public.audit_logs (board_id, item_id, user_id, action_type, old_value, new_value)
    VALUES (NEW.board_id, NEW.id, actor, 'item_deleted', jsonb_build_object('name', NEW.name), NULL);
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.audit_logs (board_id, item_id, user_id, action_type, old_value, new_value)
    VALUES (NEW.board_id, NEW.id, actor, 'item_restored', NULL, jsonb_build_object('name', NEW.name));
  END IF;

  IF OLD.name IS DISTINCT FROM NEW.name AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL THEN
    INSERT INTO public.audit_logs (board_id, item_id, user_id, action_type, old_value, new_value)
    VALUES (
      NEW.board_id, NEW.id, actor, 'name_changed',
      jsonb_build_object('column', 'Name', 'value', OLD.name),
      jsonb_build_object('column', 'Name', 'value', NEW.name)
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
          INSERT INTO public.audit_logs (board_id, item_id, user_id, action_type, old_value, new_value)
          VALUES (
            NEW.board_id, NEW.id, actor, action,
            jsonb_build_object('column', col.title, 'value', old_val),
            jsonb_build_object('column', col.title, 'value', new_val)
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
