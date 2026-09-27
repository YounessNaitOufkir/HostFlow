-- Why a task ran late: one row per slip against its baseline.
--
-- The point is to learn across projects, so a delay carries a category that
-- can be added up ("supplier delays cost 34 days over five apartments") as well
-- as a note for the detail. One row per slip rather than one per task: a task
-- can slip twice for two different reasons, and each keeps its own days so the
-- totals by reason come out right. Days may be negative - a note on finishing
-- early is a lesson too.
--
-- Access follows the task it explains: anyone who can reach the board can add
-- one, exactly as anyone who can reach it can edit its tasks (Items: Update is
-- can_access_board). Editing or removing a note is its author's, or a board
-- manager's.

CREATE TABLE IF NOT EXISTS public.delay_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  board_id    uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  days        integer NOT NULL CHECK (days <> 0 AND days BETWEEN -3650 AND 3650),
  category    text NOT NULL CHECK (category IN (
                'supplier', 'contractor', 'client_change', 'underestimated',
                'permits', 'rework', 'other'
              )),
  note        text CHECK (note IS NULL OR char_length(note) <= 2000),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delay_notes_board_idx ON public.delay_notes (board_id);
CREATE INDEX IF NOT EXISTS delay_notes_item_idx ON public.delay_notes (item_id);

ALTER TABLE public.delay_notes ENABLE ROW LEVEL SECURITY;

-- The note's board must be its task's board: otherwise a note could claim a
-- board the writer can reach while pointing at a task on one they cannot.
CREATE OR REPLACE FUNCTION public.delay_note_matches_item(p_item_id uuid, p_board_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.items WHERE id = p_item_id AND board_id = p_board_id);
$$;
REVOKE ALL ON FUNCTION public.delay_note_matches_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delay_note_matches_item(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "DelayNotes: Select" ON public.delay_notes;
DROP POLICY IF EXISTS "DelayNotes: Insert" ON public.delay_notes;
DROP POLICY IF EXISTS "DelayNotes: Update" ON public.delay_notes;
DROP POLICY IF EXISTS "DelayNotes: Delete" ON public.delay_notes;

CREATE POLICY "DelayNotes: Select" ON public.delay_notes
  FOR SELECT TO authenticated
  USING (public.can_access_board(board_id));

CREATE POLICY "DelayNotes: Insert" ON public.delay_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_board(board_id)
    AND public.delay_note_matches_item(item_id, board_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "DelayNotes: Update" ON public.delay_notes
  FOR UPDATE TO authenticated
  USING (
    public.can_access_board(board_id)
    AND (created_by = auth.uid() OR public.can_manage_board(board_id))
  )
  WITH CHECK (
    public.can_access_board(board_id)
    AND public.delay_note_matches_item(item_id, board_id)
  );

CREATE POLICY "DelayNotes: Delete" ON public.delay_notes
  FOR DELETE TO authenticated
  USING (
    public.can_access_board(board_id)
    AND (created_by = auth.uid() OR public.can_manage_board(board_id))
  );

-- Who wrote it and when it was written are facts, not fields to edit.
CREATE OR REPLACE FUNCTION public.delay_notes_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.item_id := OLD.item_id;
  NEW.board_id := OLD.board_id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delay_notes_guard_update ON public.delay_notes;
CREATE TRIGGER delay_notes_guard_update
  BEFORE UPDATE ON public.delay_notes
  FOR EACH ROW EXECUTE FUNCTION public.delay_notes_guard_update();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delay_notes TO authenticated;
REVOKE ALL ON public.delay_notes FROM anon;

-- Other people's notes arrive without a reload.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delay_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delay_notes;
  END IF;
END $$;
