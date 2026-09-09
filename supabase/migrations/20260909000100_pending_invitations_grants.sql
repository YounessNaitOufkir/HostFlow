-- Every other table in this schema picks up SELECT/INSERT/UPDATE/DELETE for
-- authenticated and ALL for service_role from the project's default-privilege
-- setup automatically. pending_invitations didn't (confirmed: service_role
-- got "permission denied", not an empty RLS-filtered result, which means the
-- ACL layer itself was blocking before RLS was ever evaluated) — granting
-- explicitly here rather than chasing why the ambient default didn't apply.

BEGIN;

GRANT SELECT, INSERT, DELETE ON public.pending_invitations TO authenticated;
GRANT ALL ON public.pending_invitations TO service_role;

COMMIT;
