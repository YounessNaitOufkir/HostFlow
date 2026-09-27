"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { reportMutationError } from "@/lib/errorReporting";
import { isDelayCategory, type DelayCategory, type DelayNote, type DelayNoteInput } from "@/lib/delays";

/** The delay notes on these boards, oldest first. Shared with the planning hint. */
export async function fetchDelayNotes(boardIds: string[]): Promise<DelayNote[]> {
  const { data, error } = await supabase
    .from("delay_notes")
    .select("*")
    .in("board_id", boardIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as DelayNote[]).filter((n) => isDelayCategory(n.category));
}

export interface DelayNotesApi {
  notes: DelayNote[];
  /** Notes by task id, oldest first. */
  byItem: Map<string, DelayNote[]>;
  add: (input: DelayNoteInput) => Promise<boolean>;
  update: (id: string, changes: { days: number; category: DelayCategory; note: string }) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}

/**
 * The delay notes on a set of boards, and the three ways to change them.
 *
 * Every write checks for a returned row, not just the absence of an error: a
 * write RLS refuses resolves with no error and no row, and would otherwise be
 * reported as saved.
 */
export function useDelayNotes(boardIds: string[]): DelayNotesApi {
  const queryClient = useQueryClient();
  const key = queryKeys.delayNotes(boardIds);

  const { data: notes = [] } = useQuery({
    queryKey: key,
    enabled: boardIds.length > 0,
    queryFn: () => fetchDelayNotes(boardIds),
  });

  // Someone else's note arrives through useLiveSync.

  const byItem = useMemo(() => {
    const map = new Map<string, DelayNote[]>();
    for (const note of notes) {
      const list = map.get(note.item_id);
      if (list) list.push(note);
      else map.set(note.item_id, [note]);
    }
    return map;
  }, [notes]);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["delayNotes"] }),
    [queryClient]
  );

  const add = useCallback(
    async (input: DelayNoteInput) => {
      const { data, error } = await supabase
        .from("delay_notes")
        .insert({
          item_id: input.itemId,
          board_id: input.boardId,
          days: input.days,
          category: input.category,
          note: input.note.trim() || null,
        })
        .select("id");
      if (error || !data?.length) {
        reportMutationError(error, "Could not save the delay note", { table: "delay_notes", operation: "insert" });
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  const update = useCallback(
    async (id: string, changes: { days: number; category: DelayCategory; note: string }) => {
      const { data, error } = await supabase
        .from("delay_notes")
        .update({ days: changes.days, category: changes.category, note: changes.note.trim() || null })
        .eq("id", id)
        .select("id");
      if (error || !data?.length) {
        reportMutationError(error, "Could not update the delay note", { table: "delay_notes", operation: "update" });
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      const { data, error } = await supabase.from("delay_notes").delete().eq("id", id).select("id");
      if (error || !data?.length) {
        reportMutationError(error, "Could not delete the delay note", { table: "delay_notes", operation: "delete" });
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  return { notes, byItem, add, update, remove };
}
