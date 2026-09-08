-- =================================================================================
-- Admin-only audit trail for items
-- =================================================================================
--
-- Distinct from `activity_logs`: that table is the collaborative per-item
-- "Updates" feed, readable by anyone who can reach the board (see
-- `20260904000004_audit_access_fixes.sql`) and written by application code on
-- every cell edit -- which is also why it silently drops rows when a write is
-- RLS-blocked or the client throws before the insert (see trap #1: supabase-js
-- resolves with `{ error }`, it never throws). This table is a stricter,
-- admin-only oversight trail, written by triggers so it cannot be skipped by a
-- client bug and cannot be forged by a client insert.
--
-- Items keep their field values in `column_values` (jsonb keyed by column id),
-- not fixed columns -- boards define their own columns dynamically
-- (`boards.columns`, see `lib/columnRegistry.ts`). So "status/assignee/
-- description/due-date/priority changed" is derived by diffing that jsonb
-- against each board's column *type*, the same way `evaluateTimeAutomations`
-- already resolves date columns by type-or-title.
-- =================================================================================

BEGIN;

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'item_created', 'item_deleted', 'item_restored',
    'status_changed', 'assignee_changed', 'priority_changed',
    'due_date_changed', 'description_changed'
  )),
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- item_id is SET NULL (not CASCADE): the whole point of an audit trail is to
-- outlive the row it describes, in particular through the 30-day trash purge.

CREATE INDEX audit_logs_board_id_created_at_idx ON public.audit_logs (board_id, created_at DESC);
CREATE INDEX audit_logs_item_id_idx ON public.audit_logs (item_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Reuse the canonical predicate rather than restate it: can_access_board_as()
-- already encodes "admins reach every non-private board by role, and never
-- bypass an explicitly private one" as of `20260820000000_staff_grants_not_blanket.sql`.
-- A second copy is exactly how the staff/directory rules drifted before.
CREATE POLICY "AuditLogs: Select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.is_global_admin() AND public.can_access_board(board_id)
  );

-- No INSERT/UPDATE/DELETE policy for authenticated: rows are written only by
-- the SECURITY DEFINER triggers below, and the table owner bypasses RLS for
-- that write. Nobody, including an admin, can write or edit history via the API.

-- ---------------------------------------------------------------------------
-- Creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_items_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_logs (board_id, item_id, user_id, action_type, old_value, new_value)
  VALUES (NEW.board_id, NEW.id, auth.uid(), 'item_created', NULL, jsonb_build_object('name', NEW.name));
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_audit_insert
AFTER INSERT ON public.items
FOR EACH ROW EXECUTE FUNCTION public.audit_items_insert();

-- ---------------------------------------------------------------------------
-- Soft delete / restore, and field changes inside column_values
-- ---------------------------------------------------------------------------

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

CREATE TRIGGER items_audit_update
AFTER UPDATE ON public.items
FOR EACH ROW EXECUTE FUNCTION public.audit_items_update();

-- Every public-schema function is auto-exposed by PostgREST as an RPC
-- endpoint. Trigger firing does not require the DML role to hold EXECUTE on
-- the trigger function, so this does not affect the triggers -- it only closes
-- off calling them directly, matching the REVOKE/GRANT service_role pattern
-- already used for the *_as() predicates.
REVOKE ALL ON FUNCTION public.audit_items_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_items_update() FROM PUBLIC, anon, authenticated;

COMMIT;
