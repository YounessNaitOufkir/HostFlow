# Claude connector — v1 build plan

Talk to Claude (desktop or phone) and have it read and act on HostFlow:
"what's on my plate today?", "what's delayed on App C?", "create a task 'Call plumber'
on App C › Lancement, due Friday", "mark it Working on it", "comment that the
plumber is booked".

**Decided:** staff can use it, on desktop and phone. A per-person **AI access** switch,
off by default and turned on by an admin. v1 can **read**, **create tasks**, **change
status** and **add comments**. Nothing else, and every limit is enforced in the database.

---

## How it works

```
Claude ──(custom connector)──► www.hostflow-app.com/api/mcp
                                   │  Bearer token = that person's HostFlow sign-in,
                                   │  issued by Supabase's OAuth server, carries client_id
                                   ▼
                              Supabase (same RLS as the app)
```

1. A person adds the connector in Claude. Claude discovers where to sign in from
   `/.well-known/oauth-protected-resource`, which points at Supabase
   (`https://jugvjyxuhlivgexfkepq.supabase.co/auth/v1`).
2. Supabase sends them to **`/oauth/consent`** in HostFlow (already configured in
   the dashboard). They sign in if needed, see what Claude will be able to do, and
   click Allow.
3. Claude calls `/api/mcp` with that person's token. The route makes a Supabase
   client **with that token**, so every read and write goes through the existing
   access rules as that person. There is no service-role key on this path.

## The safety model: a database gate, not a tool list

The token Claude holds is a real sign-in token. If the limits lived only in which
tools `/api/mcp` offers, the same token could reach the database API directly and
do anything the person can. So every limit lives in Postgres:

- **One gate on every API request.** A PostgREST *pre-request* function runs
  before each database request. It does nothing when the token has no `client_id`
  (the normal app, untouched), and when it does have one:
  - the person's `ai_access` is off → refuse ("AI access is off for this account");
  - the request is a DELETE → refuse;
  - the request writes anywhere outside a short allow-list (create/update `items`,
    insert `updates`, insert `activity_logs`, the "Completed" group heal, and the
    RPCs `merge_item_values` / `notify_users_i18n`) → refuse.

  A future permission = one line added to that allow-list, deliberately.
- **File storage** has its own API, so its write policies also get a
  "not from an AI client" condition. v1 can't upload or delete files.
- **"via Claude" comes for free**: `activity_logs` and `updates` get a
  `via_client_id` column whose default is read from the token. The app shows a
  small "via Claude" badge and no tool code can forget to set it.

## Build steps

Each step ends with a check. Nothing touches real data; testing uses
`e2e-tester@hostflow.test` in "E2E Drag Test" only.

### 0. De-risking spike (before anything else)
- Confirm Supabase serves the OAuth discovery document for the project, and that
  an OAuth-issued token works against the database API with RLS as that user.
- Confirm the pre-request hook can be set on this project
  (`alter role authenticator set pgrst.db_pre_request …`).
  **Risk:** a broken pre-request function fails *every* request in the app. The
  function's first line returns immediately when there is no `client_id`; it is
  called by hand before being wired in; the API is probed right after; and the
  rollback (`alter role authenticator reset pgrst.db_pre_request`) is
  ready to run. If you'd rather, wake the paused **Hostflow sandbox** project and
  prove it there first.
- Check whether an OAuth token can call Supabase's account endpoints (change
  email or password). If it can, block it before going further.

**If any of these fails, I stop and come back to you with the alternative.**

### 1. Database migration (applied by me, read from live definitions first)
- `profiles.ai_access boolean not null default false`; on for you.
  `prevent_unauthorized_role_change()` extended so only an admin can flip it.
- The pre-request gate function, then wire it in.
- `via_client_id` on `activity_logs` and `updates`.
- Storage write policies: add the "no AI client" condition.
- Directory trigger: no change (`ai_access` is not shown to colleagues).

### 2. Shared task logic (server-safe, unit-tested)
`evaluateEventAutomations` lives in `lib/automations/engine.ts`, which imports
`sonner` and the email client, so a server route can't use it. It moves to a
leaf module (the engine re-exports it, so nothing else changes). Then
`lib/agent/` gets the operations the tools call, each taking a user-scoped
Supabase client:

| Operation | Behaves like |
|---|---|
| `myTasks(range)` | My Work: assigned through any people column, not done (`itemIsDone`), dated from the first timeline/date column, "today" in the org timezone |
| `delays(scope)` | Overdue (end < today, not done) and stuck tasks, days late (`slipOf`), plus their delay notes |
| `find(query)` | Workspaces, boards ("App C › Lancement"), tasks by name |
| `createTask` | `addItem`: first group if none given, next position, `withCellDefaults`, dates written in the board's own timeline/date column, assignee checked against who can see the board, then the assignment notification (in-app + Telegram) |
| `setStatus` | `updateCell` on the status column: maps the requested status to one of the board's labels, Done-checkbox link, "move to Completed" rule (with the missing-group heal), activity log |
| `addComment` | `ItemPanel`'s post: plain text, escaped into the same HTML the editor saves |

Every write is checked by the row it returns, never by "no error" (RLS refusals
return no error).

### 3. Sign-in plumbing
- `app/.well-known/oauth-protected-resource` route, excluded from the login
  redirect in `proxy.ts`.
- `/login` learns `?next=` (relative paths only, so it can't be turned into an
  open redirect). That way a signed-out person who lands on the consent page
  comes back to it after signing in.
- **`/oauth/consent` page**: the app's name, what it will be able to do in plain
  words, Allow / Deny. If `ai_access` is off, it says "Ask an admin to turn on AI
  access" and offers only Deny.

### 4. The connector route — `/api/mcp`
- `mcp-handler` (Vercel's adapter for the official MCP SDK) with its auth
  wrapper. Verify the token, build the user-scoped client, register the six
  tools with zod input schemas and descriptions written so Claude asks instead
  of guessing.
- **Ambiguity is an answer, not a guess.** An unmatched or duplicated board,
  status or person returns the candidates (full "Workspace › Board" names) so
  Claude asks you.
- Errors come back as plain sentences Claude can relay ("AI access is off for
  your account — ask an admin"), never raw Postgres codes.

### 5. Admin switch
- **AI access** toggle per person in Admin Settings › User Roles, using the same
  checked-write pattern as the other toggles there. Turning it off takes effect
  on that person's very next Claude request.

### 6. Verify end to end
- `vitest` for `lib/agent/*` (board ambiguity, French "Fait" boards, done items
  excluded, timezone edge at midnight, missing Completed group).
- MCP Inspector against `localhost:3000` with the E2E account, plus direct REST
  calls with its OAuth token, proving DELETE and off-list writes are refused.
- Deploy, then **you** connect Claude Desktop, then your phone.

## Edge cases covered

- Same board name in several workspaces → candidates returned, Claude asks.
- Status word not on the board → mapped by meaning ("Fait" ↔ the board's done label);
  if still unclear, the board's own labels are returned.
- No status column / no timeline column on the board → task still created; the
  missing field is reported, not silently dropped.
- Assignee who can't see the board → refused with the reason; no notification sent.
- Completed group deleted → re-made, as the app does.
- AI access turned off mid-conversation → the next call fails with a clear sentence.
- Person loses access to a board → it simply isn't visible to Claude either.
- Task in the trash → excluded from reads, can't be edited.
- Externals → no company content (existing rules), and the switch is off anyway.

## Out of scope for v1

Editing dates (and the reschedule of dependent tasks), renaming, assigning
existing tasks, deleting, @mentions in comments, files, Google Calendar sync,
the Telegram bot using the same tools. Each comes later as its own step: a tool
plus one allow-list line.

## What you do

- Already done: the Supabase OAuth Server settings.
- After deploy: add the connector in Claude (Settings › Connectors › Add custom
  connector › `https://www.hostflow-app.com/api/mcp`), then turn on AI access for
  each staff member who should have it.
