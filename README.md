# HostFlow

Work management for teams that run the same process many times over.

Boards, groups and tasks with typed columns, seen through whichever view suits
the question: a table, a Kanban, a calendar, a dashboard, or a Gantt chart with
real critical-path scheduling. Built around multiple workspaces, because the
same board names and the same task names recur across every property, client or
project a team handles — so knowing *where* something lives matters as much as
what it is called.

Bilingual throughout (English and French), including notifications, which are
written in the language of whoever is reading them rather than whoever sent
them.

---

## What it does

**Boards and columns.** Status, priority, timeline, date, people, tags,
dependency, files, formula, checkbox, link, rating, relation and button
columns. Status and priority labels are per board, so an imported board keeps
its own vocabulary and still reads correctly to a colleague in the other
language.

**Six views over one board.** Table, Kanban, Dashboard, Calendar, Gantt and
Cards. Plus a Master Gantt across every board in a workspace, a personal My
Work view, a workspace overview, and cross-workspace search.

**Scheduling that means something.** The Gantt does a forward and backward
pass: earliest and latest start and finish, total float, and a highlighted
critical path. Dependencies come in finish-to-start, start-to-start and
finish-to-finish flavours with lag, can cross boards and workspaces, and
reschedule successors when a date moves. Baselines record the plan as agreed so
drift is visible.

**Automations.** Move a task when its status changes, alert on a due date,
flag overdue work. Time-based rules run once a day; the rest fire the moment a
matching change is made.

**Notifications.** In-app, email and Telegram, including a daily digest of
what is due and what is late.

**Import.** CSV and Excel, including Monday.com exports — groups, columns,
status labels, people and update history.

**Permissions.** Company workspaces, private workspaces, staff and external
accounts, per-workspace and per-board grants. Enforced in Postgres row-level
security rather than in the client, so the rules hold for anything that talks
to the database. See [ACCESS_MODEL.md](ACCESS_MODEL.md).

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19 with the React Compiler |
| Language | TypeScript, strict |
| Data | Supabase — Postgres, row-level security, Storage, Auth |
| Client state | TanStack Query |
| Styling | Tailwind CSS |
| Email | Resend |
| Monitoring | Sentry |
| Hosting | Vercel, including scheduled jobs |

---

## Running it

Requires Node 20+ and a Supabase project.

```bash
npm install
cp .env.example .env.local   # then fill it in — see below
npm run dev
```

Apply the migrations in `supabase/migrations/` in filename order, either
through the Supabase SQL editor or the CLI.

### Environment

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | everything |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | scheduled jobs and server routes — never exposed to the browser |
| `NEXT_PUBLIC_APP_URL` | links inside emails and Telegram messages |
| `CRON_SECRET` | authorises the scheduled jobs; they refuse to run without it |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | outbound email |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_LINK_SECRET`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Telegram notifications |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in and calendar sync |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` | error reporting |

---

## Scripts

```bash
npm run dev            # development server
npm run build          # production build
npm run lint           # eslint

npm test               # unit tests (vitest)
npm run test:watch
npm run test:coverage
npm run test:e2e       # Playwright, against a running dev server
npm run test:e2e:ui

npm run test:rls       # sign in as three fixture accounts and assert
                       # what each of them can actually read and write
```

`test:rls` is worth knowing about. Access rules fail quietly — a broken policy
does not throw, it returns rows — so this signs in as a real administrator, a
staff member and an external account over the public key, and checks what comes
back. It seeds its own namespaced fixtures and `--clean` removes them.

---

## Scheduled work

Two jobs run daily (see `vercel.json`): the automations pass and the digest.
Both record a row in `cron_runs`, and `/api/cron/watchdog` reports a job that
has stopped firing — answering `503` when something is stale, so an external
uptime monitor can watch it. Point one at that URL; a watchdog that is only a
cron cannot report that crons have stopped.

---

## Layout

```
app/            routes, API handlers and scheduled jobs
components/     UI, grouped by area — board/, gantt/, search/, views/, cells/
hooks/          data fetching (queries/) and board state (store/)
lib/            domain logic with no React in it: gantt/, automations/,
                dashboard/, dependencies/, i18n/
supabase/       migrations, in filename order
__tests__/      unit tests, mirroring lib/ and components/
e2e/            smoke tests
e2e-gantt/      scheduling tests, driven against a scratch board
scripts/        operational one-offs, each with a dry run
```

Two things are less obvious than they look:

**A status cell stores its label as its value.** `"Done"` is both what the
dropdown wrote and what the row holds. Translating a status therefore never
means translating what gets written — `lib/i18n/labels.ts` changes only the
rendering, so one board reads correctly to an English and a French colleague at
the same time. `StatusOption.semantic` records what a label *means*, which is
what the automations and dashboard read rather than pattern-matching the words.

**Boards disagree about vocabulary.** An imported board says `Fait`, another
says `Done`, and both are the user's data. Anything deciding whether work is
finished asks `lib/statusSemantics.ts` rather than comparing against a string.
