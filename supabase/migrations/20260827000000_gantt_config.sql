-- Per-board Gantt settings.
--
-- A board's schema is a JSONB blob of columns, so the chart had to work out for
-- itself which one held the dates to plot. It did that per item, taking the
-- first column that happened to be non-empty - which means a board with both a
-- "Site visit" date and a "Works" timeline plots some bars from one and some
-- from the other, and the Master Gantt, which merges every selected board's
-- columns into one list, picked essentially at random.
--
-- Declaring the choice once per board makes the chart deterministic, and lets
-- the Master Gantt resolve each item against its own board's columns and
-- status palette rather than a merged pile of everyone's.
--
-- Additive and nullable: a board with no config keeps the existing fallback
-- behaviour (timeline column first, then date column), so nothing needs a
-- backfill and no existing chart changes.
--
-- Shape:
--   {
--     "timelineColumnId":  "col-uuid",   -- the date/timeline column that positions a bar
--     "milestoneColumnId": "col-uuid",   -- a checkbox column marking milestones
--     "statusColumnId":    "col-uuid",   -- which status column colours a bar
--     "defaultZoom":       "day" | "week" | "month" | "quarter",
--     "leftColumns":       ["name", "start", "finish", "duration"],
--     "showBaseline":      false,
--     "showCriticalPath":  false
--   }

ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS gantt_config JSONB;

COMMENT ON COLUMN boards.gantt_config IS
  'Gantt chart settings for this board: which column drives the timeline, which marks milestones, default zoom, and left-table columns. NULL means fall back to the first timeline (then date) column.';
