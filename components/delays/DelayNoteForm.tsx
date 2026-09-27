"use client";

import React, { useState } from "react";
import { useT } from "@/components/LanguageProvider";
import { DELAY_CATEGORIES, DELAY_CATEGORY_KEYS, type DelayCategory } from "@/lib/delays";

export interface DelayNoteValues {
  /** Signed: positive for a delay, negative for finishing early. */
  days: number;
  category: DelayCategory;
  note: string;
}

interface DelayNoteFormProps {
  /** Late notes explain lost days, early ones gained days; the form asks accordingly. */
  direction: "late" | "early";
  initial?: Partial<DelayNoteValues>;
  onSave: (values: DelayNoteValues) => Promise<boolean> | boolean;
  onCancel: () => void;
  cancelLabel?: string;
  autoFocus?: boolean;
}

/**
 * Why a task slipped: a reason to add up across projects, how many days it
 * cost, and a sentence for the detail. The reason is required - it is the part
 * that turns a pile of notes into "suppliers cost us 34 days" - the sentence
 * is not.
 */
export function DelayNoteForm({
  direction,
  initial,
  onSave,
  onCancel,
  cancelLabel,
  autoFocus,
}: DelayNoteFormProps) {
  const t = useT();
  const [category, setCategory] = useState<DelayCategory | null>(initial?.category ?? null);
  const [days, setDays] = useState(String(Math.max(1, Math.abs(initial?.days ?? 1))));
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);

  const count = Math.round(Number(days));
  const valid = category !== null && Number.isFinite(count) && count >= 1 && count <= 3650;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    // The caller closes the form on success; on failure it stays, text intact.
    await onSave({ days: direction === "late" ? count : -count, category, note });
    setSaving(false);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        // Inside a chart that listens for keys; typing must stay typing.
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
      }}
      className="space-y-2.5"
    >
      <div role="radiogroup" aria-label={t("delay.reason")} className="flex flex-wrap gap-1.5">
        {DELAY_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            onClick={() => setCategory(c)}
            className={`px-2 py-1 rounded-full text-[12px] font-medium border transition-colors ${
              category === c
                ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white"
                : "bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-400"
            }`}
          >
            {t(DELAY_CATEGORY_KEYS[c])}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-300 shrink-0">
          {t(direction === "late" ? "delay.daysLost" : "delay.daysGained")}
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-16 px-2 py-1 rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-[13px] tabular-nums text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </label>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        rows={2}
        autoFocus={autoFocus}
        placeholder={t(direction === "late" ? "delay.notePlaceholder" : "delay.notePlaceholderEarly")}
        aria-label={t("delay.note")}
        className="w-full px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-[13px] text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
        >
          {cancelLabel ?? t("delay.cancel")}
        </button>
        <button
          type="submit"
          disabled={!valid || saving}
          className="px-3 py-1.5 rounded-md text-[13px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("delay.save")}
        </button>
      </div>
    </form>
  );
}
