-- Company board templates.
--
-- An admin saves a board from a shared workspace as a named template; anyone
-- on the Host'lik team can then start a new board - or a new shared
-- workspace's first board - from it. It replaces "Save as Template", which
-- only duplicated the board in place.
--
-- A template is a snapshot: later edits to the board do not change it, and
-- deleting it does not touch boards made from it. Private boards and private
-- workspaces are never a source, and external people never see templates.
--
-- The snapshot is built here, not sent by the client, so what the team can
-- read is decided in one place: who was assigned, what state each task was in
-- and the files attached are removed before it is stored.

CREATE TABLE IF NOT EXISTS public.board_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  snapshot jsonb NOT NULL,
  task_count integer NOT NULL DEFAULT 0,
  group_count integer NOT NULL DEFAULT 0,
  source_board_id uuid REFERENCES public.boards(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One template per name, whatever the case or surrounding spaces: saving under
-- a name in use is how a template is replaced, so two of them would be ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS board_templates_name_key
  ON public.board_templates (lower(btrim(name)));

ALTER TABLE public.board_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "BoardTemplates: Select" ON public.board_templates;
CREATE POLICY "BoardTemplates: Select" ON public.board_templates
  FOR SELECT TO authenticated
  USING (public.is_global_admin() OR public.is_company_staff());

-- Renaming and deleting are admin-only. Saving goes through the function below.
DROP POLICY IF EXISTS "BoardTemplates: Update" ON public.board_templates;
CREATE POLICY "BoardTemplates: Update" ON public.board_templates
  FOR UPDATE TO authenticated
  USING (public.is_global_admin())
  WITH CHECK (public.is_global_admin());

DROP POLICY IF EXISTS "BoardTemplates: Delete" ON public.board_templates;
CREATE POLICY "BoardTemplates: Delete" ON public.board_templates
  FOR DELETE TO authenticated
  USING (public.is_global_admin());

REVOKE ALL ON public.board_templates FROM anon, authenticated;
GRANT SELECT, DELETE ON public.board_templates TO authenticated;
-- A rename changes the name, nothing else.
GRANT UPDATE (name, updated_at) ON public.board_templates TO authenticated;

/**
 * Saves a board as a template, or replaces the template of that name.
 *
 * Raises:
 *   'Only admins can save templates.'
 *   'Board not found.'
 *   'Only boards in shared workspaces can be templates.'
 *   'Template name required.'
 *   'Template name taken.'  - a template has this name and p_replace is false
 */
CREATE OR REPLACE FUNCTION public.save_board_template(p_board_id uuid, p_name text, p_replace boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.boards%ROWTYPE;
  ws_private boolean;
  clean_name text := btrim(coalesce(p_name, ''));
  -- Columns whose values belong to this project, not to the plan.
  cleared text[];
  snap jsonb;
  n_items integer;
  n_groups integer;
  existing uuid;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Only admins can save templates.';
  END IF;

  SELECT * INTO b FROM public.boards WHERE id = p_board_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Board not found.';
  END IF;

  SELECT w.is_private INTO ws_private FROM public.workspaces w WHERE w.id = b.workspace_id;
  IF b.workspace_id IS NULL OR coalesce(ws_private, true) OR coalesce(b.is_private, false) THEN
    RAISE EXCEPTION 'Only boards in shared workspaces can be templates.';
  END IF;

  IF char_length(clean_name) = 0 THEN
    RAISE EXCEPTION 'Template name required.';
  END IF;
  clean_name := left(clean_name, 80);

  SELECT coalesce(array_agg(c->>'id'), '{}') INTO cleared
  FROM jsonb_array_elements(coalesce(b.columns, '[]'::jsonb)) c
  WHERE c->>'type' IN ('people', 'status', 'files');

  WITH live_items AS (
    SELECT i.id, i.name, i.group_id, i.position, coalesce(i.column_values, '{}'::jsonb) - cleared AS column_values
    FROM public.items i
    WHERE i.board_id = b.id AND i.deleted_at IS NULL
  )
  SELECT
    jsonb_build_object(
      'version', 1,
      'board', jsonb_build_object(
        'description', b.description,
        'columns', coalesce(b.columns, '[]'::jsonb),
        'item_name_column', b.item_name_column,
        'gantt_config', b.gantt_config
      ),
      'groups', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'color', g.color, 'position', g.position) ORDER BY g.position)
        FROM public.groups g WHERE g.board_id = b.id
      ), '[]'::jsonb),
      'items', coalesce((
        SELECT jsonb_agg(to_jsonb(li) ORDER BY li.position) FROM live_items li
      ), '[]'::jsonb),
      -- Only links between two of this board's tasks: one reaching another
      -- board would tie every new project to that board.
      'links', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'source_item_id', l.source_item_id, 'target_item_id', l.target_item_id,
          'link_type', l.link_type, 'dep_type', l.dep_type, 'lag_days', l.lag_days))
        FROM public.item_links l
        WHERE l.source_item_id IN (SELECT id FROM live_items)
          AND l.target_item_id IN (SELECT id FROM live_items)
      ), '[]'::jsonb),
      'automations', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'trigger_column_id', a.trigger_column_id, 'trigger_value', a.trigger_value,
          'action_type', a.action_type, 'action_target_id', a.action_target_id,
          'action_payload', a.action_payload, 'enabled', a.enabled))
        FROM public.automations a WHERE a.board_id = b.id
      ), '[]'::jsonb)
    ),
    (SELECT count(*) FROM live_items)
  INTO snap, n_items;

  SELECT count(*) INTO n_groups FROM public.groups WHERE board_id = b.id;

  SELECT id INTO existing FROM public.board_templates WHERE lower(btrim(name)) = lower(clean_name);
  IF existing IS NOT NULL THEN
    IF NOT p_replace THEN
      RAISE EXCEPTION 'Template name taken.';
    END IF;
    UPDATE public.board_templates
    SET snapshot = snap, task_count = n_items, group_count = n_groups,
        source_board_id = b.id, updated_at = now()
    WHERE id = existing;
    RETURN existing;
  END IF;

  INSERT INTO public.board_templates (name, snapshot, task_count, group_count, source_board_id, created_by)
  VALUES (clean_name, snap, n_items, n_groups, b.id, auth.uid())
  RETURNING id INTO existing;
  RETURN existing;
END;
$$;

REVOKE ALL ON FUNCTION public.save_board_template(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_board_template(uuid, text, boolean) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'board_templates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.board_templates;
  END IF;
END $$;
