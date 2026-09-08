# Cursor Implementation Plan: HostFlow Refinements

**Role:** Expert Software Architect
**Context:** I am building HostFlow, a bilingual work management application designed for teams that run repetitive processes. The app features strict granular access controls where company work and private personal work coexist securely.
**Current Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres, RLS), TanStack Query, Tailwind CSS, Vercel.
**Feature to build:** Four critical infrastructure and UX improvements: Audit Trail, Trash Purge Job, Workspace Automations, and Multi-Tab Real-Time Sync.

---

## 1. Feature Overview & Definition of Done

**Goal:** Implement four missing architectural features to finalize the platform's access model, operational hygiene, and real-time user experience.

**Definition of Done:**
- **Audit Trail:** Item creation/deletion, status, assignee, description, due date, and priority changes are logged to a new Postgres table. An "Activity Feed" tab exists on the Board view, accessible only to admins, strictly respecting privacy (admins cannot see logs of private workspaces).
- **Trash Purge Job:** Soft-deleted items older than 30 days are permanently purged via an automated cron job, and their associated Supabase Storage file attachments are deleted securely.
- **Per-Workspace Automations:** The Workspace Settings modal contains an "Automations" tab allowing users to configure automation rules scoped by `workspace_id`.
- **Multi-Tab Sync:** Modifying data in one browser tab instantly refreshes TanStack Query data in all other open tabs on the same origin via `BroadcastChannel`.

---

## 2. Architecture & Data Model

- **Audit Logs (`audit_logs` table):** 
  - Columns: `id`, `board_id`, `user_id`, `action_type`, `old_value`, `new_value`, `created_at`.
  - **RLS Policy:** Must duplicate the strict `can_access_workspace_as()` logic. Admins get access, but *only* if the workspace is non-private or they are explicitly invited.
- **Trash Purge Strategy:** A Next.js API route (`/api/cron/purge-trash`) triggered by Vercel cron. It must query expired items, delete their files via `@supabase/supabase-js` storage API, and then delete the Postgres rows.
- **Automations Data:** Reuse the existing `automations` table logic, but adapt the UI to set `workspace_id` instead of `board_id`.
- **Real-Time Sync:** Leverage the existing `notifyTabSync()` helper in `useRealtimeSync.ts` to dispatch events across the `BroadcastChannel`.

---

## 3. File Touchpoints

The following literal file paths will need to be created or modified:

- `supabase/migrations/[timestamp]_create_audit_log.sql` (New)
- `components/views/ActivityLog.tsx` (New)
- `components/ItemPanel.tsx`
- `app/api/cron/purge-trash/route.ts` (New)
- `vercel.json`
- `components/WorkspaceDialog.tsx`
- `components/WorkspaceAutomations.tsx` (New)
- `hooks/store/useItemMutations.ts`
- `hooks/store/useBoardMutations.ts`
- `hooks/store/useColumnMutations.ts`
- `hooks/store/useGroupMutations.ts`
- `hooks/store/useWorkspaceMutations.ts`

---

## 4. Implementation Steps (The Checklist)

- [x] **Step 1: Database Migration for Audit Logs**
  - **Files:** `supabase/migrations/20260908000000_create_audit_log.sql`, `scripts/rls-audit.mjs`
  - **Logic:** Created the `audit_logs` table (distinct from the existing `activity_logs`, which is a board-member-visible feed, not an admin oversight trail — see the migration's header comment). Items store fields in `column_values` jsonb keyed by dynamic per-board column ids rather than fixed columns, so the trigger resolves "status/assignee/priority/due-date/description changed" by joining `boards.columns` for each changed key's `type`, mirroring the existing type-or-title pattern in `evaluateTimeAutomations`. RLS reuses the canonical `is_global_admin()` + `can_access_board()` predicates rather than restating the privacy rule (a second copy is what caused prior drift in this codebase). No INSERT/UPDATE/DELETE policy exists for `authenticated` — rows are written only by two `SECURITY DEFINER` triggers, and direct RPC access to those trigger functions is revoked.
  - **Verification:** Extended `scripts/rls-audit.mjs` with 6 new checks (admin sees audit rows on a reachable board incl. a `status_changed` row proving the jsonb-diff logic; admin sees none on a private board they don't belong to; a non-admin staff member sees none at all even with full board access; external sees none; nobody can INSERT a row directly). `npm run test:rls` → 32/32 passed, no regressions.

- [x] **Step 2: Activity Feed UI**
  - **Files:** `components/views/ActivityLog.tsx` (new), `components/layout/BoardHeader.tsx`, `app/page.tsx`, `hooks/store/types.ts`, `hooks/queries/queryKeys.ts`, `types/index.ts`, `lib/i18n/en.ts`, `lib/i18n/fr.ts`
  - **Logic:** Built as a board-level tab (per the Definition of Done), not embedded in `ItemPanel.tsx` — that file already has unrelated, unfinished, dead scaffolding for the *other* `activity_logs` table which this intentionally does not touch. The tab itself is gated `isAdmin` in `BoardHeader` (hidden entirely for non-admins, not just access-denied), and `ActivityLog.tsx` self-gates too via `useAuth()` as defense in depth, following the pattern in `TrashView.tsx`. Fetches `audit_logs` with an embedded `items(name)` join for item names, resolves actor names via the existing `useProfilesQuery()` (`user_directory`, already the safe/shared surface for this), and renders a human sentence per action type (bilingual, en/fr) with an icon, e.g. "Amine changed Status on 'Kickoff' from Working on it to Done."
  - **Verification:** `npm run build`-equivalent typecheck + lint clean on all changed files. Verified live in a real browser (Playwright) against the disposable `ZZ RLS` fixtures from Step 1: signed in as `rls-admin` — the Activity tab appears, opens, and correctly renders both seeded `status_changed` rows with resolved item name and old→new values, no console errors. Signed in as `rls-member` (non-admin, full board access) — confirmed the word "Activity" appears nowhere on the page; the tab is fully hidden, not just empty.

- [ ] **Step 3: API Route for Trash Purge Job**
  - **Files:** `app/api/cron/purge-trash/route.ts`, `vercel.json`
  - **Logic:** Create an endpoint authenticated via `CRON_SECRET`. Query the DB for items where `deleted_at < NOW() - INTERVAL '30 days'`. Extract storage paths, delete files using the Supabase Storage JS client, then permanently delete the rows. Add the route to `vercel.json` cron schedules.
  - **Verification:** Seed a soft-deleted item with an older timestamp, hit the endpoint locally via curl, and verify the DB row and Storage object disappear.

- [ ] **Step 4: Workspace Automations UI**
  - **Files:** `components/WorkspaceAutomations.tsx`, `components/WorkspaceDialog.tsx`
  - **Logic:** Create a UI for defining automations scoped to `workspace_id`. Add an "Automations" tab to `WorkspaceDialog.tsx` that renders this component.
  - **Verification:** Open Workspace Settings, create an automation, and verify it saves to the DB with a `workspace_id` and `board_id = null`.

- [ ] **Step 5: Multi-Tab Real-Time Sync via Hooks**
  - **Files:** `hooks/store/useItemMutations.ts`, `hooks/store/useBoardMutations.ts`, `hooks/store/useColumnMutations.ts`, `hooks/store/useGroupMutations.ts`, `hooks/store/useWorkspaceMutations.ts`
  - **Logic:** Import `notifyTabSync` from `hooks/useRealtimeSync.ts`. In every mutation's `onSuccess` callback, execute `notifyTabSync(boardId)`.
  - **Verification:** Open the app in two separate browser tabs. Drag a Kanban card in Tab 1; verify Tab 2 updates instantly without a manual refresh.

---

## 5. Strict Constraints (Anti-Patterns)

1. **Do not bypass RLS for Audit Logs:** Never use the `SUPABASE_SERVICE_ROLE_KEY` to fetch audit logs for the UI. Admins must never see private workspace logs; RLS is the single source of truth for this.
2. **Do not use `pg_cron` for the purge job:** Because Supabase Storage attachments must be deleted, a pure SQL cron job is insufficient. You must use the Next.js API route as instructed so the Supabase JS client can handle the HTTP storage deletions.
3. **Do not introduce new state managers:** Stick exclusively to TanStack Query. Do not add Redux, Zustand, or Context for caching. Use the `BroadcastChannel` pattern exactly as specified to trigger query invalidations.
