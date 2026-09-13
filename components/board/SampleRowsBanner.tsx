"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { reportMutationError } from "@/lib/errorReporting";
import { useT } from "@/components/LanguageProvider";
import { SAMPLE_MARKER } from "@/lib/boardTemplates";
import type { Item } from "@/types";

/**
 * Offers to clear the example rows a template seeded.
 *
 * The rows exist because a board with correct columns and no rows still looks
 * like nothing happened — you cannot see what a timeline or a status column is
 * for until something is in one. The cost of that is rows nobody asked for, so
 * removing all of them has to be one action rather than a per-row chore.
 *
 * Shown for as long as any seeded row survives, and gone for good once they
 * are: it keys off the rows themselves, not a dismissed flag, so it cannot
 * outlast what it refers to.
 */
export default function SampleRowsBanner({
  items,
  onCleared,
}: {
  items: Item[];
  onCleared: (clearedIds: string[]) => void;
}) {
  const t = useT();
  const [clearing, setClearing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(false);

  const sampleIds = items.filter((item) => item.column_values?.[SAMPLE_MARKER]).map((item) => item.id);

  if (hidden || sampleIds.length === 0) return null;

  const clear = async () => {
    setClearing(true);
    setFailed(false);
    try {
      // A hard delete, not the soft delete the trash uses: these rows were never
      // the user's work, and routing them through the bin would leave them to be
      // emptied a second time.
      //
      // .select() matters: a DELETE that row-level security blocks returns NO
      // error and removes nothing, because Postgres filters non-matching rows
      // via USING rather than raising. Checking `error` alone would report
      // success, clear the banner, and leave every example row on the board.
      const { data, error } = await supabase.from("items").delete().in("id", sampleIds).select("id");
      if (error) throw error;
      const deleted = (data ?? []).map((row) => row.id);
      if (deleted.length === 0) throw new Error("No example rows were deleted");
      onCleared(deleted);
    } catch (err) {
      reportMutationError(err, "Failed to clear example rows", {
        table: "items",
        operation: "delete",
      });
      setFailed(true);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-400/25 bg-amber-50 dark:bg-amber-400/10 px-4 py-2.5">
      <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0 text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/15">
        <Sparkles size={14} />
      </span>
      <p className="flex-1 text-[13px] leading-snug text-amber-900 dark:text-amber-100">
        {failed ? t("tpl.clearFailed") : t("tpl.sampleBanner")}
      </p>
      <button
        onClick={clear}
        disabled={clearing}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 px-3 py-1.5 text-[12.5px] font-semibold text-gray-900 transition-colors disabled:opacity-60"
      >
        {clearing && <Loader2 size={13} className="animate-spin" />}
        {clearing ? t("tpl.clearingSamples") : t("tpl.clearSamples")}
      </button>
      <button
        onClick={() => setHidden(true)}
        aria-label={t("common.close")}
        className="shrink-0 p-1 rounded-md text-amber-700/70 dark:text-amber-200/70 hover:bg-amber-100 dark:hover:bg-amber-400/15 transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  );
}
