-- Dependency types, lag, and baselines.
--
-- 1. `item_links` recorded only that one task depended on another. Every real
--    scheduling tool also records *how*: finish-to-start is the common case,
--    but start-to-start ("the two surveys run together") and finish-to-finish
--    ("both must be signed off the same day") are ordinary, and a lag lets a
--    link say "three days after", which is how curing time, notice periods and
--    inspection windows are actually planned.
--
--    Defaults reproduce today's behaviour exactly: every existing row becomes
--    a finish-to-start link with no lag, which is what the chart already drew.
--
-- 2. `items.baseline` stores the plan as it was agreed, so the chart can show
--    the drift between what was promised and where the work now sits. Without
--    it a Gantt can only ever show the current plan, which always looks on time.

ALTER TABLE item_links
  ADD COLUMN IF NOT EXISTS dep_type TEXT NOT NULL DEFAULT 'FS',
  ADD COLUMN IF NOT EXISTS lag_days INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_links_dep_type_check'
  ) THEN
    ALTER TABLE item_links
      ADD CONSTRAINT item_links_dep_type_check
      CHECK (dep_type IN ('FS', 'SS', 'FF', 'SF'));
  END IF;
END $$;

COMMENT ON COLUMN item_links.dep_type IS
  'How the two tasks are tied: FS finish-to-start, SS start-to-start, FF finish-to-finish, SF start-to-finish. Only meaningful when link_type = ''dependency''.';
COMMENT ON COLUMN item_links.lag_days IS
  'Days of delay (positive) or overlap (negative) applied to the dependency.';

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS baseline JSONB;

COMMENT ON COLUMN items.baseline IS
  'The agreed plan for this item, captured at a point in time: {"start":"yyyy-mm-dd","end":"yyyy-mm-dd","captured_at":"<iso timestamp>"}. NULL until a baseline is taken.';
