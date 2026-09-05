-- The interface language is chosen in the browser and kept in localStorage,
-- which the server cannot see. Automation emails are composed in a Vercel cron
-- with no session behind them, so a user who works in French was still sent
-- English notifications.
--
-- Storing the choice on the profile gives the sender something to read. It is
-- additive with a default, so every existing row keeps working unchanged.
alter table public.profiles
  add column if not exists language text not null default 'en';

alter table public.profiles
  drop constraint if exists profiles_language_check;

alter table public.profiles
  add constraint profiles_language_check
  check (language in ('en', 'fr'));

comment on column public.profiles.language is
  'Interface language (en|fr). Mirrors the browser choice so server-side senders can match it.';
