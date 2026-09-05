-- Applied via the Supabase API on 2026-09-04; kept here so the schema history
-- is complete and a fresh environment builds the same shape.
--
-- The automations and the digest run once a day and tell nobody they did.
-- Sentry catches an error raised INSIDE a run; it cannot see a run that never
-- happened - a cron removed from vercel.json, a job silently timing out, a
-- deploy that renamed the path. The failure is discovered when somebody
-- mentions they stopped getting email, which is weeks of nothing.
--
-- Each run now leaves a row here, and /api/cron/watchdog reads them.

create table if not exists public.cron_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text        not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  -- Whatever the job counts as work done: rules fired, digests sent. Lets a
  -- run that finished but did nothing be told apart from one that never ran.
  detail      jsonb       not null default '{}'::jsonb,
  error       text
);

comment on table public.cron_runs is
  'One row per scheduled-job run. Read by /api/cron/watchdog to notice a job that has stopped firing.';

create index if not exists cron_runs_job_started_idx
  on public.cron_runs (job, started_at desc);

alter table public.cron_runs enable row level security;

-- Written by the jobs and read by the watchdog, all of which hold the service
-- role. No access for anyone else: run history says when the estate is
-- unattended, which is not something a signed-in user needs.
revoke all on public.cron_runs from anon, authenticated;

-- Bypassing RLS is not the same as holding a table GRANT: without this the
-- jobs and the watchdog are refused outright.
grant select, insert, update on public.cron_runs to service_role;
