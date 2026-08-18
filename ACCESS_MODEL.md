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

Admins *do* get automatic access to all **non-private** workspaces and boards
without being added as members, so company work needs no per-admin bookkeeping.

## New users

Registration is open — anyone can sign up.

On registration a user gets a **private personal workspace** ("My Workspace") and
nothing else. They can immediately create boards there. Company access is granted
afterwards by an admin, per workspace or per board.

## Automations

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
| Inherited board privacy fix | Written (`20260818000005`) — awaiting apply |
| Leaked-password protection | Done — `lib/passwordSecurity.ts`, wired into signup and reset |
| Per-workspace automations | Not started |
| Audit trail | Not started |
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
- Private workspaces show a lock in the sidebar, and their creator can invite
  others through the members modal. That modal is the ONLY way into a private
  workspace; `20260818000004` removes the `is_global_admin()` branch that let any
  admin insert themselves into one.
- A SELECT policy must never resolve access by looking the row up in the table
  being written: `STABLE` predicates cannot see the new row during
  `INSERT … RETURNING`, which is what `20260818000003` fixes. Compare a column on
  the candidate row instead.
