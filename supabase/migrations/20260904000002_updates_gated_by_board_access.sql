-- Applied via the Supabase API on 2026-09-04; kept here so the schema history
-- is complete and a fresh environment builds the same shape.
--
-- Comments were readable by anyone signed in, and writable onto any item.
--
-- `updates` carried "Enable read access for all authenticated users" with a
-- USING of literally `true`, and an INSERT policy whose WITH CHECK was also
-- `true`. Measured with a fixture account holding no workspace and no board
-- grant: 0 boards, 0 items, 0 activity_logs - and every comment in the
-- system. The discussion on a private workspace's board was readable by any
-- account that could sign in, and a comment could be posted onto an item the
-- author could not see.
--
-- Both are now settled the way every other table settles it: by whether the
-- caller can reach the board the comment's item belongs to. scripts/rls-audit.mjs
-- covers it now; it did not before, which is how this survived.

drop policy if exists "Enable read access for all authenticated users on updates" on public.updates;
drop policy if exists "Enable insert for authenticated users on updates" on public.updates;

create policy "Updates: Select" on public.updates
  for select using (
    exists (
      select 1 from public.items i
       where i.id = public.updates.item_id
         and public.can_access_board(i.board_id)
    )
  );

-- Authorship is still the author's own, and the item still has to be one they
-- can reach: without the second half, anyone could post onto any board by id.
create policy "Updates: Insert" on public.updates
  for insert with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.items i
       where i.id = public.updates.item_id
         and public.can_access_board(i.board_id)
    )
  );

-- Editing and deleting were already the author's own and stay that way, but
-- losing board access should end the ability to edit too.
drop policy if exists "Enable update for users based on author_id" on public.updates;
drop policy if exists "Enable delete for users based on author_id" on public.updates;

create policy "Updates: Update" on public.updates
  for update using (
    auth.uid() = author_id
    and exists (
      select 1 from public.items i
       where i.id = public.updates.item_id
         and public.can_access_board(i.board_id)
    )
  );

create policy "Updates: Delete" on public.updates
  for delete using (
    auth.uid() = author_id
    and exists (
      select 1 from public.items i
       where i.id = public.updates.item_id
         and public.can_access_board(i.board_id)
    )
  );

-- teams and team_members are empty and unused, but "everyone can read" is the
-- wrong default to leave lying about for whenever they are picked up. Reading
-- the roster is a staff matter; changing it was already admin-only.
drop policy if exists "Teams: Select" on public.teams;
drop policy if exists "TeamMembers: Select" on public.team_members;

create policy "Teams: Select" on public.teams
  for select using (public.is_company_staff());

create policy "TeamMembers: Select" on public.team_members
  for select using (public.is_company_staff());
