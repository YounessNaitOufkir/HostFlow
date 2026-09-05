-- Merge a cell edit into an item rather than overwriting the whole object.
--
-- updateCell built the new column_values by spreading the client's copy of the
-- row and writing all of it back. Two people editing DIFFERENT cells on the same
-- row inside one refetch window therefore each wrote a complete object built
-- from their own stale snapshot, and the second write silently discarded the
-- first one's edit. Cells change constantly on a shared board, so this was the
-- likeliest way to lose work in the product.
--
-- `||` on jsonb is a shallow merge and the top-level keys are column ids, so it
-- is exactly the right shape: only the keys in the patch move. The client sends
-- just the cells it touched.
--
-- SECURITY INVOKER on purpose - this stays bound by the caller's own row-level
-- security, exactly as the UPDATE it replaces was. It is not a way to reach a
-- row the caller could not already write.
create or replace function public.merge_item_values(p_item_id uuid, p_patch jsonb)
returns void
language sql
security invoker
set search_path to 'public', 'pg_temp'
as $$
  update public.items
     set column_values = coalesce(column_values, '{}'::jsonb) || p_patch,
         updated_at = now()
   where id = p_item_id;
$$;

grant execute on function public.merge_item_values(uuid, jsonb) to authenticated;
