-- Status and Priority default to "Not Started" and "Low" instead of blank.
--
-- Labels are per column (the French board says "Non commencé" / "Basse"), so
-- the default is looked up in the column's own options, by the same rule as
-- lib/cellDefaults.ts. A column with none of the expected labels gets no
-- default rather than one it does not offer.
--
-- Applied in the database, not only in the app, because tasks are created from
-- many places: the board, the New Task form, imports, templates, duplicates.

-- ---------------------------------------------------------------------------
-- 1. The rule
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cell_default_label(col JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE col ->> 'type'
    WHEN 'status' THEN
      CASE
        WHEN jsonb_typeof(col -> 'settings' -> 'statusLabels') IS DISTINCT FROM 'array'
          OR jsonb_array_length(col -> 'settings' -> 'statusLabels') = 0
        THEN 'Not Started'
        ELSE (
          SELECT l ->> 'label'
          FROM jsonb_array_elements(col -> 'settings' -> 'statusLabels') WITH ORDINALITY AS t(l, n)
          WHERE l ->> 'semantic' = 'idle'
             OR l ->> 'label' ~* '^(not started|non commencé|non commence)$'
          ORDER BY n
          LIMIT 1
        )
      END
    WHEN 'priority' THEN
      CASE
        WHEN jsonb_typeof(col -> 'settings' -> 'priorityLabels') IS DISTINCT FROM 'array'
          OR jsonb_array_length(col -> 'settings' -> 'priorityLabels') = 0
        THEN 'Low'
        ELSE (
          SELECT l ->> 'label'
          FROM jsonb_array_elements(col -> 'settings' -> 'priorityLabels') WITH ORDINALITY AS t(l, n)
          WHERE l ->> 'label' ~* '^(low|basse)$'
          ORDER BY n
          LIMIT 1
        )
      END
    ELSE NULL
  END;
$$;

-- Fills every blank ('' / 'Empty' / null / missing) Status and Priority value.
CREATE OR REPLACE FUNCTION public.fill_cell_defaults(cols JSONB, vals JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  col JSONB;
  label TEXT;
  cur JSONB;
  result JSONB := COALESCE(vals, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(cols) IS DISTINCT FROM 'array' THEN
    RETURN result;
  END IF;
  FOR col IN SELECT value FROM jsonb_array_elements(cols) LOOP
    IF col ->> 'type' NOT IN ('status', 'priority') OR col ->> 'id' IS NULL THEN
      CONTINUE;
    END IF;
    cur := result -> (col ->> 'id');
    IF cur IS NOT NULL AND cur <> 'null'::jsonb AND cur <> '""'::jsonb AND cur <> '"Empty"'::jsonb THEN
      CONTINUE;
    END IF;
    label := public.cell_default_label(col);
    IF label IS NOT NULL THEN
      result := jsonb_set(result, ARRAY[col ->> 'id'], to_jsonb(label), true);
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. New tasks, tasks moved to another board, and any write that leaves a blank
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.items_fill_cell_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.column_values := public.fill_cell_defaults(
    (SELECT b.columns FROM public.boards b WHERE b.id = NEW.board_id),
    NEW.column_values
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_fill_cell_defaults ON public.items;
CREATE TRIGGER items_fill_cell_defaults
  BEFORE INSERT OR UPDATE OF board_id, column_values ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.items_fill_cell_defaults();

-- ---------------------------------------------------------------------------
-- 3. A Status or Priority column added to a board: its tasks get the default
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.boards_fill_new_column_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Only when a status/priority column appears that was not there before
  -- (new, or retyped). Renames, resizes and reorders change nothing here.
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(NEW.columns, '[]'::jsonb)) AS n(c)
    WHERE n.c ->> 'type' IN ('status', 'priority')
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(OLD.columns, '[]'::jsonb)) AS o(c)
        WHERE o.c ->> 'id' = n.c ->> 'id' AND o.c ->> 'type' = n.c ->> 'type'
      )
  ) THEN
    RETURN NEW;
  END IF;

  -- Filling a default is not a change anyone made: keep it out of the history.
  PERFORM set_config('hostflow.filling_defaults', 'on', true);
  UPDATE public.items i
     SET column_values = public.fill_cell_defaults(NEW.columns, i.column_values)
   WHERE i.board_id = NEW.id
     AND public.fill_cell_defaults(NEW.columns, i.column_values) IS DISTINCT FROM i.column_values;
  PERFORM set_config('hostflow.filling_defaults', 'off', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boards_fill_new_column_defaults ON public.boards;
CREATE TRIGGER boards_fill_new_column_defaults
  AFTER UPDATE OF columns ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.boards_fill_new_column_defaults();

-- ---------------------------------------------------------------------------
-- 4. audit_items_update: skip the per-column history while defaults are filled.
--    Rewritten from the live definition; the only change is the
--    hostflow.filling_defaults check on the column_values block.
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

  IF NEW.column_values IS DISTINCT FROM OLD.column_values
     AND COALESCE(current_setting('hostflow.filling_defaults', true), '') <> 'on' THEN
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
