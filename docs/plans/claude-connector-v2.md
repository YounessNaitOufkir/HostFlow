# Claude connector — v2 build plan

Builds on [v1](claude-connector-v1.md). Request: an assistant (Yasser's "Life OS"
agent, or anyone's Claude) reads and writes HostFlow by **stable IDs**, limited
to the workspaces its person chose — e.g. Yasser: "Life OS" (his private
workspace) and "Host'Lik Strategy" (company), nothing else.

**Decided (2026-10-06):** each person sets their own AI scope in their profile;
Google Calendar sync runs on AI edits; a person with no scope set gets **no**
access (so after v2, v1 users must tick their workspaces once).

## Safety model additions (all in Postgres)

- **`ai_workspace_scopes(user_id, workspace_id, can_read, can_write)`**, own rows
  only, only for workspaces the person can open; `can_write` implies `can_read`.
  Not writable by AI clients (the gate's allow-list does not include it).
- **Restrictive policies** on every table holding workspace content
  (workspaces, boards, groups, items, updates, activity_logs, item_links,
  delay_notes, automations, board_members, workspace_members, workspace_pins,
  pending_invitations, notifications, audit_logs, webhooks). Each is
  `not ai_request() OR <row is in a read scope>` for reading and
  `... in a write scope` for writing. The first half is evaluated once per query
  (an initplan), so the app's own traffic pays nothing per row.
- **Gate (`agent_request_gate`)**: RPCs are now allow-listed for GET too (a
  stable function could otherwise be read around the policies). Writes added:
  `POST item_links` (subtasks), `rpc/merge_item_values` (field updates that do not
  clobber concurrent edits), `rpc/agent_claim_request` / `rpc/agent_finish_request`
  (idempotency).
- **Idempotency**: `agent_requests(user_id, request_key, tool, payload_hash,
  status, result)`. A write tool given `request_id` claims it first; a retry with
  the same id returns the stored result; the same id with a different payload
  is refused; a retry while the first is still running is told so.
- File reads from storage are also closed to AI clients (v2 has no file tools).

## Tools

Reads (all IDs, all scope-limited by the database):
`list_workspaces`, `list_boards(workspace_id)`, `get_board(board_id)` (groups,
columns, types, status/priority options), `list_tasks(board_id, group_id?,
include_completed?, cursor?, limit?)`, `get_task(task_id)` (every field by column
id + title, comments with replies, subtasks, parent, dependencies),
`list_members(workspace_id | board_id)`. v1's `my_tasks`, `delays`, `find` stay.

Writes (every one returns ids, an app link, and a `side_effects` list):
- `create_task` — now also takes `board_id` / `group_id` / `fields` / `request_id`.
- `update_task(task_id, name?, fields?, request_id?)` — name, dates, people,
  status, any writable custom field. Status runs the done-link and the move rule;
  dates reschedule dependent tasks exactly as the board does; name/dates/people
  re-sync Google Calendar for the assignees.
- `move_task(task_id, group_id)` — same board only.
- `create_subtask(parent_task_id, name, …)` — a task on the parent's board linked
  `item_links(source = parent, target = child, link_type = 'subitem')`.
- `set_status`, `add_comment` — unchanged, plus `request_id`.

**Notifying others needs approval:** a write that would assign someone other
than the caller returns `needs_confirmation` (who would be notified) and writes
nothing, unless called again with `confirm_notify: true`.

Field rules: status/priority take the board's labels (or a meaning, for status);
text, numbers, date (YYYY-MM-DD), timeline {start,end}, checkbox, rating, tags,
link {url,label}, people (ids or names; must be able to see the board).
`formula`, `files`, `dependency`, `relation` are refused as write targets.

## App changes

- Profile settings › **AI assistant** tab: every workspace the person can open,
  with Read / Write switches. Off-by-default; "AI access is off" note when the
  admin switch is off.
- Task panel › **Subtasks** section: the task's subtasks (and its parent), so
  subtasks created by an assistant are visible.
- Consent screen copy names the scope: only the workspaces chosen in the profile.

## Edge cases

Retry after partial failure returns the same ids and what failed; same
request_id + different payload → refused; move to another board's group →
refused; assignee who cannot see the board → refused; invalid value for a
field's type → refused with the expected format; subtask of a subtask →
refused (one level); dependency loop → warning, as in the app; scope revoked
mid-conversation → next call refused; pagination is stable (position, id).
