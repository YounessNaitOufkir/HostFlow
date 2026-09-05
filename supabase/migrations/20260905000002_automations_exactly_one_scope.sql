-- Every automations policy is of the form
--   (workspace_id IS NOT NULL AND can_manage_workspace(workspace_id))
--   OR (board_id IS NOT NULL AND can_manage_board(board_id))
--
-- which authorizes a row when EITHER populated scope checks out. A row carrying
-- both would therefore pass on board rights alone while also acting across a
-- whole workspace the caller cannot manage. Nothing writes such a row today and
-- none exists, but the policy would accept one, so the shape is pinned here
-- rather than left to the four policies to agree about.
alter table public.automations
  add constraint automations_exactly_one_scope
  check ((board_id is null) <> (workspace_id is null));
