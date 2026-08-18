-- =================================================================================
-- Automations: activate per workspace, and stop anyone editing anyone's rules
-- =================================================================================
--
-- ACCESS_MODEL.md specifies automations are activated per workspace and every
-- board inside inherits the activation. The table only had board_id.
--
-- Two scopes are supported rather than one, because they are not interchangeable:
--
--   workspace_id  time/behaviour rules (overdue tagging, SLA alerts, timeline
--                 shifting). These read nothing board-specific: the engine scans
--                 each board's own date and status columns, so one row can apply
--                 across a whole workspace.
--
--   board_id      rules whose target only exists on one board, i.e. move_group,
--                 whose action_target_id is a group id.
--
-- The RLS on this table was also wrong in three ways:
--
--   * INSERT and DELETE only checked auth.role() = 'authenticated', so any
--     signed-in user could add or delete automation rules on anybody's board.
--   * SELECT used `board_id IN (SELECT b.id FROM boards b JOIN workspaces w ...)`
--     with no filter on the subquery, which is every board in the database.
--   * There was NO UPDATE policy at all. AutomationsModal's enable/disable
--     toggle writes `enabled`, so RLS silently matched zero rows while the
--     optimistic UI showed the switch flipping. Toggling never persisted.
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Scope columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.automations
  ALTER COLUMN board_id DROP NOT NULL;

-- Existing rows are board-scoped; give them their workspace too so that
-- workspace-level activation reflects what is already configured.
UPDATE public.automations a
   SET workspace_id = b.workspace_id
  FROM public.boards b
 WHERE a.board_id = b.id
   AND a.workspace_id IS NULL;

ALTER TABLE public.automations
  DROP CONSTRAINT IF EXISTS automations_scope_check;
ALTER TABLE public.automations
  ADD CONSTRAINT automations_scope_check
  CHECK (workspace_id IS NOT NULL OR board_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS automations_workspace_idx ON public.automations (workspace_id);
CREATE INDEX IF NOT EXISTS automations_board_idx     ON public.automations (board_id);

COMMENT ON COLUMN public.automations.workspace_id IS
  'Applies to every board in this workspace. Used for time/behaviour rules.';
COMMENT ON COLUMN public.automations.board_id IS
  'Applies to this board only. Used where the action targets something board-specific, e.g. a group.';

-- ---------------------------------------------------------------------------
-- 2. Which automations apply to a board
--
-- SECURITY INVOKER on purpose: RLS below still applies, so a caller can never
-- read rules for a board they cannot see.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.automations_for_board(b_id UUID)
RETURNS SETOF public.automations
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT a.*
    FROM public.automations a
   WHERE a.board_id = b_id
      OR a.workspace_id = (SELECT b.workspace_id FROM public.boards b WHERE b.id = b_id);
$$;

REVOKE ALL ON FUNCTION public.automations_for_board(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.automations_for_board(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS: readable if you can reach the scope, writable only if you manage it
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view automations for their workspaces" ON public.automations;
DROP POLICY IF EXISTS "Users can create automations"                    ON public.automations;
DROP POLICY IF EXISTS "Users can delete automations"                    ON public.automations;
DROP POLICY IF EXISTS "Automations: Select" ON public.automations;
DROP POLICY IF EXISTS "Automations: Insert" ON public.automations;
DROP POLICY IF EXISTS "Automations: Update" ON public.automations;
DROP POLICY IF EXISTS "Automations: Delete" ON public.automations;

CREATE POLICY "Automations: Select" ON public.automations
  FOR SELECT TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.can_access_workspace(workspace_id))
    OR (board_id IS NOT NULL AND public.can_access_board(board_id))
  );

CREATE POLICY "Automations: Insert" ON public.automations
  FOR INSERT TO authenticated
  WITH CHECK (
    (workspace_id IS NOT NULL AND public.can_manage_workspace(workspace_id))
    OR (board_id IS NOT NULL AND public.can_manage_board(board_id))
  );

-- Missing entirely before this, which is why the enable/disable toggle never saved
CREATE POLICY "Automations: Update" ON public.automations
  FOR UPDATE TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.can_manage_workspace(workspace_id))
    OR (board_id IS NOT NULL AND public.can_manage_board(board_id))
  )
  WITH CHECK (
    (workspace_id IS NOT NULL AND public.can_manage_workspace(workspace_id))
    OR (board_id IS NOT NULL AND public.can_manage_board(board_id))
  );

CREATE POLICY "Automations: Delete" ON public.automations
  FOR DELETE TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.can_manage_workspace(workspace_id))
    OR (board_id IS NOT NULL AND public.can_manage_board(board_id))
  );

COMMIT;
