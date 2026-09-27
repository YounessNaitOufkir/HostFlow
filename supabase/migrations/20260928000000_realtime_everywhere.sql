-- Live updates everywhere: broadcast the tables the app listens to but the
-- database never sent.
--
-- The client subscribed to comments, automations and access changes, but these
-- tables were not in the supabase_realtime publication, so those listeners
-- never fired and a colleague's comment, or a workspace someone was given,
-- only showed after a reload.
--
-- Every table here has row-level security with a select policy, and Realtime
-- checks it per subscriber, so each person only receives changes to rows they
-- can already read. Deletes are the exception Realtime makes: it cannot check
-- a row that is gone, so it sends everyone subscribed only the primary key,
-- which is an id and nothing else.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'updates',           -- comments on a task
    'activity_logs',     -- a task's history tab
    'automations',
    'workspaces',
    'workspace_members', -- given or losing access to a workspace
    'board_members'      -- given or losing access to a single board
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
