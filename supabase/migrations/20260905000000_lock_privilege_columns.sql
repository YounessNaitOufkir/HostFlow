-- Stop an ordinary account writing its own role, staff flag or ownership.
--
-- "Profiles: Update own" is USING (id = auth.uid()) WITH CHECK (id = auth.uid()).
-- It decides WHICH ROW you may write and never which columns; there is no trigger
-- on profiles; and `authenticated` held a table-wide UPDATE grant. The only
-- constraint touching role is profiles_admin_implies_staff (admin implies staff),
-- which is satisfied by setting both. So any signed-in account - an external one
-- included - could call the Data API directly:
--
--     update profiles set role='admin', is_staff=true where id = auth.uid();
--
-- and pass every check. The UI only offers that button to the platform owner, but
-- the UI is not the boundary; PostgREST is. This is the cron_runs lesson from the
-- other side: RLS decides rows, GRANTs decide columns, and a policy cannot narrow
-- a privilege the grant already handed out.
--
-- A column-level REVOKE cannot subtract from a table-level GRANT, so the table
-- grant is dropped and only the safe columns are granted back. Left out
-- deliberately:
--
--   role, is_staff, is_owner   the privilege columns this migration exists for
--   id, email                  identity; changing either is a no-op or an
--                              impersonation attempt
--   allowed_workspaces,        the retired grant arrays that ACCESS_MODEL.md
--   allowed_boards             replaced with workspace_members / board_members
--   created_at                 nothing should backdate its own row
--
-- Every legitimate writer of the privilege columns is a SECURITY DEFINER function
-- that runs as its owner and so is unaffected by this:
--
--   set_user_role(target, role)    requires is_global_admin(); refuses to demote
--                                  the owner, to promote a non-staff account, or
--                                  to remove the last administrator.
--   set_user_staff(target, staff)  requires is_global_admin().
--   restore_my_admin()             requires is_platform_owner(); the owner's own
--                                  self-recovery path.
--
-- The two "Restore admin" buttons try a direct update first and fall back to
-- restore_my_admin() when it fails. After this the direct attempt fails for
-- everyone, so both take the RPC path - which is the guarded one.
--
-- anon is not mentioned: it holds no grants on this table at all.

revoke update on public.profiles from authenticated;

grant update (
  full_name,
  avatar_initials,
  avatar_url,
  color,
  language,
  is_onboarded,
  telegram_chat_id,
  telegram_notifications_enabled,
  email_notifications_enabled,
  daily_digest_enabled,
  in_app_alerts_enabled
) on public.profiles to authenticated;
