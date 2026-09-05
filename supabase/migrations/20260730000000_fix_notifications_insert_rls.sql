-- Fix: Allow authenticated users to insert notifications
-- The automation engine inserts notifications on behalf of the system
-- when SLA alerts or overdue tagging fires for an assignee.
-- Without this policy, all notification inserts were silently blocked by RLS.

CREATE POLICY "Notifications: Insert"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
