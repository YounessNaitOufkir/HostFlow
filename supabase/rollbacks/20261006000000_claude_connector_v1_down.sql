-- Undo 20261006000000_claude_connector_v1.sql.
--
-- Step 1 alone takes the gate out of every request and is the emergency
-- switch: if the app's API starts failing right after the migration, run just
-- these two lines.
alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';

-- The rest removes the connector's database side entirely. With the gate gone,
-- /api/mcp refuses to run (it requires profiles.ai_access to exist), but drop
-- the column only if the connector is being abandoned, not to fix an outage.
drop policy if exists "AI clients: no uploads" on storage.objects;
drop policy if exists "AI clients: no file changes" on storage.objects;
drop policy if exists "AI clients: no file deletes" on storage.objects;
drop function if exists public.agent_request_gate();
drop function if exists public.set_user_ai_access(uuid, boolean);
drop function if exists public.ai_access_user_ids();
alter table public.updates drop column if exists via_client_id;
alter table public.activity_logs drop column if exists via_client_id;
alter table public.profiles drop column if exists ai_access;
