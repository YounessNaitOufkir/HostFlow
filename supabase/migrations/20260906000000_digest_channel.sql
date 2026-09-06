-- One channel for the daily digest, chosen by the reader.
--
-- The digest was Telegram-only and silent about it; widening it to email made it
-- arrive TWICE for anyone with both, which is worse. Neither is a setting - the
-- reader was never asked. This is the ask: email or Telegram, exactly one.
--
-- 'email' is the default deliberately. Every account has an address, and only
-- one has Telegram connected, so it is the choice that delivers for everybody.
-- Anyone already reading the digest in Telegram picks it here and keeps it.
--
-- NOT NULL with a default and a CHECK rather than an enum: a two-value list that
-- may grow (in-app? SMS?) is cheaper to extend as a constraint than as a type,
-- and a NULL here would mean "no channel", which is never a thing a reader wants.
alter table public.profiles
  add column if not exists digest_channel text not null default 'email';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_digest_channel_valid'
  ) then
    alter table public.profiles
      add constraint profiles_digest_channel_valid
      check (digest_channel in ('email', 'telegram'));
  end if;
end $$;

-- The part that is easy to miss and fails in silence.
--
-- 20260905000000 dropped the table-wide UPDATE grant on profiles and granted
-- back only the safe columns, so that no account could write its own role. A new
-- column is NOT covered by that grant. Without this line the settings screen
-- would appear to save - PostgREST reports no error for a column the caller may
-- not write, and an RLS-or-grant-blocked UPDATE returns zero rows and no error -
-- and the choice would simply never persist.
grant update (digest_channel) on public.profiles to authenticated;
