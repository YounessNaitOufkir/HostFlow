# HostFlow access model

Agreed 2026-08-18. This is the intended design, not necessarily what the code
does yet — see "Status" at the bottom.

## The problem it solves

HostFlow serves two audiences at once:

- **Host'lik company work** — property management, shared across the team.
- **Personal work** — anything a user creates for themselves, which must stay
  private *even from the platform owner*.

Separating those two cleanly is the single most important design constraint.

## Identity

| Concept | Where it lives | Meaning |
|---|---|---|
| Owner | `profiles.is_owner` (exactly one true) | Youness. Cannot be demoted. Replaces the hardcoded email check. |
| Admin | `profiles.role = 'admin'` | Manages company workspaces, users, role assignment. |
| Member | `profiles.role = 'member'` | Everyone else. The default for new signups. |
| Team | `profiles.is_staff = true` | Host'lik. Sees every shared workspace without being invited. |
| External | `profiles.is_staff = false` | Outside the company. The default for new signups. |

Role and staff are independent axes, with one rule tying them together:
**Administrator implies Team.** `profiles_admin_implies_staff` enforces it in the
database, so "External Administrator" cannot be represented — granting a role was
otherwise a way around the badge.

`manager` and `contractor` remain in the `user_role` enum for historical rows but
are no longer used. Removing enum values in Postgres is disruptive, so they are
retired rather than dropped.

**A global role grants no data access by itself.** Access comes from membership.
This is why a third "contractor" role is unnecessary: a new `member` sees nothing
belonging to Host'lik until they are added to something.

## Access

Two grants, both explicit rows (never arrays):

- `workspace_members (user_id, workspace_id)` — access to a workspace and, by
  inheritance, every non-private board inside it.
- `board_members (user_id, board_id)` — access to one board only, without access
  to its workspace. This is how "someone on Communication must not reach
  Lancement in the same workspace" is expressed.

`profiles.allowed_workspaces` and `profiles.allowed_boards` are **retired**. They
duplicated the join tables, could not record who granted access or when, and had
already accumulated references to boards that no longer exist.

## Privacy

`is_private` marks content as belonging to its creator rather than the company.

- **Workspaces** — `workspaces.is_private`.
- **Boards** — `boards.is_private`, nullable. `NULL` means *inherit from the
  workspace*, which is how "depends where it's created" is expressed: a board
  created inside a private workspace is private; one created in a company
  workspace is shared.

Effective privacy for *display* is `COALESCE(board.is_private, workspace.is_private, false)` —
a board in a private workspace shows a lock.

For *access* the two must not be conflated. A board that merely sits in a private
workspace is not creator-only; it is exactly as private as its workspace, and the
workspace check already enforces that. Only an **explicit** `boards.is_private =
true` cuts off workspace members — that is how "Communication but not Lancement
in the same workspace" is expressed. Using the inherited value here would mean
inviting somebody to a private workspace showed them the shell and none of its
boards.

### The rule that overrides everything else

**Private content is visible only to its creator and to people the creator has
explicitly granted. Admins do not bypass this. The owner does not bypass this.**

This is deliberate. A user must be able to keep personal work on the platform
without the company — including its owner — being able to read it. Any future
"admin can see everything" shortcut breaks the product's core promise.

### The second rule that overrides everything else

**A non-private workspace is Host'lik work and is reachable only by Team.** Not by
role, not by an invitation, not by having created something inside it. `is_staff` is
a ceiling, not a convenience.

**A ceiling only — it grants nothing by itself** (revised 2026-08-20,
`20260820000000_staff_grants_not_blanket.sql`). Being Team is *necessary* to reach
company content and is never *sufficient*:

| Tier | `is_staff` / `role` | Reaches |
|---|---|---|
| Admin | `true` / `admin` | Every non-private workspace and board, by role |
| Team member | `true` / `member` | Only explicit `workspace_members` / `board_members` grants |
| External | `false` | No company content at all |

Until this revision, staff got automatic access to every non-private workspace, which
made membership rows decorative for them and made the admin Data Access panel appear
to do nothing. That was wrong for the business: a marketing hire is Team, but must not
read the Communication or Lancement boards. Grants are now load-bearing for everyone
except admins.

A board grant without a workspace grant is the intended way to express "this board and
no other in the same workspace". `can_see_workspace_shell()` already surfaces the
workspace in the sidebar for someone holding only a board grant, so the board is
reachable without opening up its siblings.

The consequence is deliberate: **collaboration with an external happens in a private
workspace or board.** A shared workspace cannot host an outsider on a single board.

Both rules are expressed once, in `can_access_workspace_as()` / `can_access_board_as()`;
the `auth.uid()` forms are one-line wrappers so the rule cannot drift between the app
and the API.

## New users

Registration is open — anyone can sign up.

On registration a user gets a **private personal workspace** ("My Workspace") and
nothing else. They can immediately create boards there. New signups are External, so
company access begins with an admin marking them Team; per-workspace and per-board
grants then apply within private content.

A non-staff user cannot create a non-private workspace — that would produce
Host'lik-classed content owned by someone the ceiling then locks out of it.

## Automations

Two scopes, because they are not interchangeable:

- `automations.workspace_id` — time and behaviour rules (overdue tagging, SLA
  alerts, timeline shifting). These read nothing board-specific: the engine
  scans each board's own date and status columns, so one row covers a workspace.
- `automations.board_id` — rules whose target exists on a single board, i.e.
  `move_group`, whose `action_target_id` is a group id.

A board inherits its workspace's rules plus its own; `automations_for_board()`
resolves that, and the cron applies the same union.

- Activated **per workspace**; every board inside inherits the activation.
- Nothing runs until explicitly activated. No rule is ever on by default.
- An automation must never overwrite a status a human set to a completed value.
  A task already marked done stays done even if its timeline is in the past.

### Overdue notification routing

| Assignee | Who is notified |
|---|---|
| A member | The assignee (*"your task X is overdue"*) **and** admins (*"task X assigned to Y is overdue"*) |
| An admin | That admin only — one notification, not two |

## Notification preferences

The four `profiles.*_enabled` flags are authoritative. The separate
`notification_preferences` table was never read or written by the application and
is removed; its insert trigger was the cause of a three-week signup outage.

## Personal data

- **Names** are visible to users who share a workspace.
- **Emails** are visible only to the owner, and to the user themselves.
- Users see only people they share a workspace with, not the whole org directory.

## Retention

Soft-deleted items stay in the trash for **30 days**, then are purged. Purging is
irreversible; confirm point-in-time recovery is available before enabling the job.

## Scale assumptions

5–10 users within the year, ~150–200 items per board at peak. Design for
correctness and clarity at that size, not for horizontal scale.

## Status

| Area | State |
|---|---|
| Signup trigger fixed | Applied (`20260817000000`) |
| `SECURITY DEFINER` hardening | Applied (`20260817000001`) |
| Owner flag, role migration, privacy columns | Applied (`20260818000000`) |
| RLS rebuild against this model | Applied (`20260818000001`) |
| Profiles, directory view, signup flow | Applied (`20260818000002`) |
| INSERT…RETURNING visibility fix | Applied (`20260818000003`) |
| Membership policies + invites | Applied (`20260818000004`) |
| Inherited board privacy fix | Applied (`20260818000005`) |
| Workspace-scoped automations | Applied (`20260818000006`) |
| Access-grant notifications | Applied (`20260818000007`) |
| Staff flag, shared visibility | Applied (`20260818000008`) |
| Staff see each other in the directory | Applied (`20260819000000`) |
| Team badge as a hard ceiling | Applied (`20260819000001`) |
| One access rule, parameterized by user | Applied (`20260819000002`) |
| Team grants nothing by itself; admin-only blanket access | Applied (`20260820000000`) |
| Leaked-password protection | Done — `lib/passwordSecurity.ts`, wired into signup and reset |
| Per-workspace automations | Not started |
| Audit trail | Applied (`20260908000000`) — DB layer only, no UI yet |
| Trash purge job | Not started |

### Notes for whoever picks this up

- Leaked-password protection is implemented in the app, not Supabase: the native
  feature is Pro-plan only and this org is on free.
- Time-based automations run **only** from `/api/cron/automations`. The
  client-side call in `useItemMutations` was removed; it re-evaluated every item
  on the board on each cell edit.
- Notifications aimed at other users must go through `notify_users()`. Direct
  inserts are restricted to your own rows.
- People lists read `user_directory`, never `profiles` — that is what keeps
  emails out of the client.
- `user_directory` still lets staff see one another even though staff no longer
  share every workspace (`20260820000000` ended that). Keep it that way: the
  branch exists so `PeopleCell` can resolve assignee ids, and without it assigned
  items render as unassigned. Colleagues stay mutually visible; only *data* access
  narrowed.
- Private workspaces show a lock in the sidebar, and their creator can invite
  others through the members modal. That modal is the ONLY way into a private
  workspace; `20260818000004` removes the `is_global_admin()` branch that let any
  admin insert themselves into one.
- A SELECT policy must never resolve access by looking the row up in the table
  being written: `STABLE` predicates cannot see the new row during
  `INSERT … RETURNING`, which is what `20260818000003` fixes. Compare a column on
  the candidate row instead.
