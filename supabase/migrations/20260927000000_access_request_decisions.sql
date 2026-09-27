-- Access requests get an answer.
--
-- Until now "request access to Host'lik" set profiles.access_requested_at and
-- notified the admins, and that was all: an admin could approve by switching
-- the person to Team, but there was no way to decline, the person never heard
-- back, and an unanswered request blocked them forever.
--
-- Each request is now a row with a status. Admins decide through
-- decide_access_request(): approve (which makes the person a Team member) or
-- decline with a reason, which the requester is told. A decline is final: the
-- person cannot ask again. Only an admin adding them to the team afterwards -
-- the usual way - lets them in, and that clears the decline without erasing it.
--
-- profiles.access_requested_at is kept as the "a request is waiting" marker the
-- existing code reads; it is set while a request waits and cleared once it is
-- decided.

CREATE TABLE IF NOT EXISTS public.access_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  -- NULL on a decline means the standard reason, shown in the reader's language.
  reason      text CHECK (reason IS NULL OR char_length(reason) <= 300),
  decided_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at  timestamptz,
  -- A decline stops blocking once the person is added to the team anyway.
  cleared_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_requests_user_idx ON public.access_requests (user_id, created_at DESC);
-- One waiting request per person.
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_one_pending
  ON public.access_requests (user_id) WHERE status = 'pending';

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AccessRequests: Select" ON public.access_requests;
CREATE POLICY "AccessRequests: Select" ON public.access_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_global_admin());

-- No insert/update/delete policies: rows change only through the functions below.
REVOKE ALL ON public.access_requests FROM anon;
GRANT SELECT ON public.access_requests TO authenticated;

-- Carry over any request still waiting under the old marker.
INSERT INTO public.access_requests (user_id, status, created_at)
SELECT p.id, 'pending', p.access_requested_at
  FROM public.profiles p
 WHERE p.access_requested_at IS NOT NULL
   AND NOT COALESCE(p.is_staff, false)
   AND NOT EXISTS (SELECT 1 FROM public.access_requests r WHERE r.user_id = p.id AND r.status = 'pending');

-- ---------------------------------------------------------------------------
-- Asking. Rewritten from the live definition; adds the request row, the
-- decline check and the "already on the team" check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_workspace_access(note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  requester_name TEXT;
  clean_note     TEXT := NULLIF(TRIM(COALESCE(note, '')), '');
  request_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_staff, false)) THEN
    RAISE EXCEPTION 'Already a team member.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.access_requests WHERE user_id = auth.uid() AND status = 'pending') THEN
    RAISE EXCEPTION 'Access already requested.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.access_requests
     WHERE user_id = auth.uid() AND status = 'declined' AND cleared_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Access request declined.';
  END IF;

  IF clean_note IS NOT NULL AND char_length(clean_note) > 500 THEN
    clean_note := left(clean_note, 500);
  END IF;

  SELECT COALESCE(full_name, 'A user') INTO requester_name
    FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.access_requests (user_id, note)
  VALUES (auth.uid(), clean_note)
  RETURNING id INTO request_id;

  UPDATE public.profiles SET access_requested_at = now() WHERE id = auth.uid();

  INSERT INTO public.notifications (user_id, message, message_key, message_vars, related_user_id)
  SELECT a.id,
         format('%s is asking to join the Host''lik team.%s',
                requester_name,
                CASE WHEN clean_note IS NULL THEN '' ELSE ' Note: ' || clean_note END),
         'notif.workspaceAccessRequest',
         jsonb_build_object('name', requester_name, 'note', clean_note, 'requestId', request_id),
         auth.uid()
    FROM public.profiles a
   WHERE a.role = 'admin' AND a.id <> auth.uid();
END;
$function$;

-- ---------------------------------------------------------------------------
-- Deciding. Admins only; the first decision counts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_access_request(request_id uuid, approve boolean, reason text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  req          public.access_requests%ROWTYPE;
  decider_name TEXT;
  clean_reason TEXT := NULLIF(TRIM(COALESCE(reason, '')), '');
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can answer access requests.';
  END IF;

  SELECT * INTO req FROM public.access_requests WHERE id = request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such access request.';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'Already decided.';
  END IF;

  IF clean_reason IS NOT NULL AND char_length(clean_reason) > 300 THEN
    clean_reason := left(clean_reason, 300);
  END IF;

  IF approve THEN
    UPDATE public.access_requests
       SET status = 'approved', decided_by = auth.uid(), decided_at = now()
     WHERE id = request_id;
    -- The usual way onto the team: its own checks, and its own notification.
    PERFORM public.set_user_staff(req.user_id, true);
    UPDATE public.profiles SET access_requested_at = NULL WHERE id = req.user_id;
  ELSE
    UPDATE public.access_requests
       SET status = 'declined', reason = clean_reason, decided_by = auth.uid(), decided_at = now()
     WHERE id = request_id;
    UPDATE public.profiles SET access_requested_at = NULL WHERE id = req.user_id;

    SELECT COALESCE(full_name, 'An administrator') INTO decider_name
      FROM public.profiles WHERE id = auth.uid();

    BEGIN
      INSERT INTO public.notifications (user_id, message, message_key, message_vars)
      VALUES (
        req.user_id,
        format('Your request to join Host''lik was declined: %s',
               COALESCE(clean_reason, 'You''re not a member of the Host''lik team.')),
        'notif.accessDeclined',
        jsonb_build_object('name', decider_name, 'reason', clean_reason)
      );
    EXCEPTION WHEN OTHERS THEN
      -- A notification must never cost the decision itself.
      RAISE WARNING 'decide_access_request: notification failed for %: %', req.user_id, SQLERRM;
    END;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.decide_access_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_access_request(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Joining the team another way settles the request too.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_access_requests_on_team(target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.access_requests
     SET status = 'approved', decided_by = auth.uid(), decided_at = now()
   WHERE user_id = target AND status = 'pending';
  UPDATE public.access_requests
     SET cleared_at = now()
   WHERE user_id = target AND status = 'declined' AND cleared_at IS NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.settle_access_requests_on_team(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.settle_access_requests_on_staff()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(NEW.is_staff, false) AND NOT COALESCE(OLD.is_staff, false) THEN
    NEW.access_requested_at := NULL;
    PERFORM public.settle_access_requests_on_team(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS settle_access_requests_on_staff ON public.profiles;
CREATE TRIGGER settle_access_requests_on_staff
  BEFORE UPDATE OF is_staff ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.settle_access_requests_on_staff();

-- Rewritten from the live definition: a shared workspace grant already cleared
-- the marker; it now settles the request rows as well.
CREATE OR REPLACE FUNCTION public.clear_access_request_on_membership_grant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = NEW.workspace_id AND is_private = false
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
     SET access_requested_at = NULL
   WHERE id = NEW.user_id
     AND access_requested_at IS NOT NULL;

  PERFORM public.settle_access_requests_on_team(NEW.user_id);
  RETURN NEW;
END;
$function$;

-- Decisions reach the other admins' notification menus, and the requester's
-- sidebar, without a reload.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'access_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.access_requests;
  END IF;
END $$;
