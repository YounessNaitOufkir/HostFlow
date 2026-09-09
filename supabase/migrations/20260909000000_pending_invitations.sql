-- =================================================================================
-- External email invites
-- =================================================================================
--
-- A workspace manager types an email. If it already belongs to an account,
-- access is granted immediately (handled in the API route, service-role,
-- since that also needs to look the email up). If not, a row lands here and
-- a signup email goes out; when that person eventually creates an account,
-- redeem_pending_invitations() below notices the matching email and finishes
-- the grant — the same shape can_access_workspace_as() already expects
-- (workspace_members row, plus is_staff when the target is a shared
-- workspace, since staff is a ceiling nothing below it can pass).
-- =================================================================================

BEGIN;

CREATE TABLE public.pending_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  role public.user_role NOT NULL DEFAULT 'member',
  -- Whether redemption should also flip profiles.is_staff. A private
  -- workspace's invite defaults to false (an external collaborator on one
  -- private space has no business reaching the rest of the company); a
  -- shared workspace's invite defaults to true, or the grant it produces
  -- would be silently useless — is_staff is a ceiling nothing below it can
  -- pass, per can_access_workspace_as().
  is_staff_invite BOOLEAN NOT NULL DEFAULT false,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE INDEX pending_invitations_email_idx ON public.pending_invitations (email);

ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;

-- Same gate as everywhere else membership is granted or revoked (workspace_members,
-- board_members): can_manage_workspace() already covers creator, an
-- admin/manager workspace_members row, or a non-private-workspace admin.
CREATE POLICY "PendingInvitations: Select" ON public.pending_invitations
  FOR SELECT TO authenticated
  USING (public.can_manage_workspace(workspace_id));

CREATE POLICY "PendingInvitations: Insert" ON public.pending_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace(workspace_id));

CREATE POLICY "PendingInvitations: Delete" ON public.pending_invitations
  FOR DELETE TO authenticated
  USING (public.can_manage_workspace(workspace_id));

-- ---------------------------------------------------------------------------
-- Redemption: fires when the invited person's profile row is created.
--
-- A trigger on public.profiles rather than on auth.users, deliberately: this
-- codebase already has exactly one trigger on auth.users (on_auth_user_created
-- / handle_new_user), and Postgres runs same-event triggers on one table in
-- trigger-name order, which is a fragile thing to depend on. handle_new_user
-- inserts into public.profiles as a plain, unconditional statement (not
-- through another trigger), so an AFTER INSERT trigger on profiles fires
-- immediately once that statement completes and *before* handle_new_user goes
-- on to build the new user's own private workspace — nested, not raced.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_pending_invitations()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inv RECORD;
BEGIN
  FOR inv IN
    SELECT * FROM public.pending_invitations WHERE lower(email) = lower(NEW.email)
  LOOP
    INSERT INTO public.workspace_members (user_id, workspace_id, role)
    VALUES (NEW.id, inv.workspace_id, inv.role)
    ON CONFLICT (user_id, workspace_id) DO NOTHING;

    IF inv.is_staff_invite THEN
      UPDATE public.profiles SET is_staff = true WHERE id = NEW.id AND is_staff = false;
    END IF;

    DELETE FROM public.pending_invitations WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER redeem_pending_invitations_trigger
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.redeem_pending_invitations();

-- Auto-exposed by PostgREST as an RPC endpoint like every public-schema
-- function; trigger firing never depends on the DML role holding EXECUTE, so
-- this only closes off calling it directly. Same pattern as
-- 20260908000000_create_audit_log.sql's audit_items_insert/update.
REVOKE ALL ON FUNCTION public.redeem_pending_invitations() FROM PUBLIC, anon, authenticated;

COMMIT;
