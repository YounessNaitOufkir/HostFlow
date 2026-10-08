-- One-time fill of existing blank Status / Priority values, requested by the
-- owner on 2026-10-02 (dry run: 332 tasks on 13 boards, trash included).
-- Uses public.fill_cell_defaults() from 20261002000000.
--
-- Not a change anyone made, so it writes no history and leaves updated_at
-- alone: the audit and updated_at triggers are switched off for this
-- transaction only.

BEGIN;

-- 1. The French board's Status had no "not started" option, so it had no
--    default. Give it one, first in the list like the other boards'.
UPDATE public.boards b
   SET columns = (
     SELECT jsonb_agg(
              CASE
                WHEN c ->> 'id' = 'a5ff0e75-ee9f-4373-acd5-77232403f0a4'
                 AND NOT (c -> 'settings' -> 'statusLabels' @> '[{"label":"Non commencé"}]')
                THEN jsonb_set(
                       c, '{settings,statusLabels}',
                       '[{"label":"Non commencé","color":"bg-[#c4c4c4]","semantic":"idle"}]'::jsonb
                         || (c -> 'settings' -> 'statusLabels')
                     )
                ELSE c
              END
              ORDER BY ord
            )
     FROM jsonb_array_elements(b.columns) WITH ORDINALITY AS t(c, ord)
   )
 WHERE b.id = 'e870595b-d0f0-4cdb-900c-883733771fbc';

-- 2. Fill every blank value.
ALTER TABLE public.items DISABLE TRIGGER items_audit_update;
ALTER TABLE public.items DISABLE TRIGGER items_updated_at;

UPDATE public.items i
   SET column_values = public.fill_cell_defaults(b.columns, i.column_values)
  FROM public.boards b
 WHERE b.id = i.board_id
   AND public.fill_cell_defaults(b.columns, i.column_values) IS DISTINCT FROM i.column_values;

ALTER TABLE public.items ENABLE TRIGGER items_audit_update;
ALTER TABLE public.items ENABLE TRIGGER items_updated_at;

COMMIT;
