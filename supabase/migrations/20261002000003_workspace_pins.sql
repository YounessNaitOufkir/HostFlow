-- Pinned workspaces: each person's own shortlist at the top of the workspace
-- menu. Stored per account (not per browser) so pins follow you to another
-- device. Private to the person: nobody else reads or changes them.

CREATE TABLE IF NOT EXISTS public.workspace_pins (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A deleted workspace takes its pins with it.
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

ALTER TABLE public.workspace_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace pins: own" ON public.workspace_pins;
CREATE POLICY "Workspace pins: own" ON public.workspace_pins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Pinning needs a workspace you can actually see, so a pin cannot be used to
-- probe for workspace ids.
DROP POLICY IF EXISTS "Workspace pins: add" ON public.workspace_pins;
CREATE POLICY "Workspace pins: add" ON public.workspace_pins
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id));

DROP POLICY IF EXISTS "Workspace pins: remove" ON public.workspace_pins;
CREATE POLICY "Workspace pins: remove" ON public.workspace_pins
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.workspace_pins TO authenticated;
