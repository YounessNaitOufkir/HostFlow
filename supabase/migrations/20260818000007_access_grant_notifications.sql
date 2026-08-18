-- =================================================================================
-- Notify people when they are granted access to a workspace or a board
-- =================================================================================
--
-- Being invited was completely silent: a workspace simply appeared in your
-- sidebar, with nothing telling you it had happened or who did it.
--
-- Done as a trigger rather than in the client so it fires however the grant is
-- made — the members modal, an admin screen, a script, or a future API.
--
-- Deliberately quiet in two cases:
--   * granting yourself access (which is what happens when you create a
--     workspace, via handle_new_workspace)
--   * a grant made outside a user session (auth.uid() IS NULL), e.g. the signup
--     trigger creating someone's personal workspace, or a service-role backfill
-- =================================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_workspace_access_granted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  granter_name TEXT;
  ws_name      TEXT;
  ws_private   BOOLEAN;
BEGIN
  -- Self-grants and system grants are not news
  IF auth.uid() IS NULL OR NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, 'Someone') INTO granter_name
    FROM public.profiles WHERE id = auth.uid();

  SELECT name, COALESCE(is_private, false) INTO ws_name, ws_private
    FROM public.workspaces WHERE id = NEW.workspace_id;

  INSERT INTO public.notifications (user_id, message)
  VALUES (
    NEW.user_id,
    format('%s gave you access to the %sworkspace "%s".',
           granter_name,
           CASE WHEN ws_private THEN 'private ' ELSE '' END,
           COALESCE(ws_name, 'workspace'))
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A notification must never cost somebody their access grant
  RAISE WARNING 'notify_workspace_access_granted failed for % on %: %',
    NEW.user_id, NEW.workspace_id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_workspace_access_granted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workspace_members_notify ON public.workspace_members;
CREATE TRIGGER workspace_members_notify
  AFTER INSERT ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_workspace_access_granted();

-- --- the same for single-board grants -------------------------------------

CREATE OR REPLACE FUNCTION public.notify_board_access_granted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  granter_name TEXT;
  b_name       TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, 'Someone') INTO granter_name
    FROM public.profiles WHERE id = auth.uid();

  SELECT name INTO b_name FROM public.boards WHERE id = NEW.board_id;

  INSERT INTO public.notifications (user_id, message, board_id)
  VALUES (
    NEW.user_id,
    format('%s gave you access to the board "%s".', granter_name, COALESCE(b_name, 'board')),
    NEW.board_id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_board_access_granted failed for % on %: %',
    NEW.user_id, NEW.board_id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_board_access_granted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS board_members_notify ON public.board_members;
CREATE TRIGGER board_members_notify
  AFTER INSERT ON public.board_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_board_access_granted();

COMMIT;
