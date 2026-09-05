-- Keep Google OAuth tokens out of the browser.
--
-- GoogleCalendarConnectButton selected google_refresh_token and used it for one
-- thing: testing it against null to decide whether to show "Connected". So a
-- long-lived Google credential was shipped to the client to answer a yes/no
-- question. An access token expires in an hour; a refresh token does not, so any
-- XSS on that page walked away with durable access to the user's calendar.
--
-- Row-level security was never the gap here - "Users can manage their own
-- integrations" (auth.uid() = user_id) already stopped anyone reading anyone
-- else's row. The gap was that the row itself contained secrets the client had
-- no reason to hold.
--
-- The yes/no becomes a generated column, and SELECT on the two token columns is
-- revoked. UPDATE is deliberately untouched: the disconnect button nulls both
-- tokens and never reads them back, and supabase-js sends an update without a
-- RETURNING clause, so it needs no SELECT privilege to work.
--
-- Server-side calendar sync uses the service role and is unaffected.

alter table public.user_integrations
  add column if not exists google_connected boolean
  generated always as (google_refresh_token is not null) stored;

revoke select on public.user_integrations from authenticated;

grant select (
  user_id,
  google_calendar_id,
  google_connected,
  created_at,
  updated_at
) on public.user_integrations to authenticated;
