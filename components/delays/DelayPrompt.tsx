"use client";

import React from "react";
import { X } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import type { Item } from "@/types";
import { DelayNoteForm, type DelayNoteValues } from "./DelayNoteForm";

export interface DelayPromptRequest {
  item: Item;
  boardId: string;
  /** Days the edit(s) just pushed the task further behind plan. */
  days: number;
}

interface DelayPromptProps {
  request: DelayPromptRequest;
  onSave: (values: DelayNoteValues) => Promise<boolean>;
  onSkip: () => void;
}

/**
 * Asked the moment a task slips, while the reason is still known.
 *
 * Not a modal: the edit has already happened, and the person may be in the
 * middle of rearranging a plan. It sits at the bottom until answered or
 * skipped, and a skipped slip stays visible as unexplained on the Gantt.
 */
export function DelayPrompt({ request, onSave, onSkip }: DelayPromptProps) {
  const t = useT();
  const { item, days } = request;

  return (
    <div
      role="dialog"
      aria-label={t("delay.title")}
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[140] w-[440px] max-w-[calc(100vw-32px)] rounded-xl border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-[#1e2333] shadow-2xl p-4"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 break-words">
            {days === 1
              ? t("delay.promptTitleOne", { name: item.name })
              : t("delay.promptTitle", { name: item.name, days })}
          </p>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{t("delay.promptBody")}</p>
        </div>
        <button
          type="button"
          onClick={onSkip}
          aria-label={t("delay.skip")}
          className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-700 dark:hover:text-gray-200 shrink-0"
        >
          <X size={16} />
        </button>
      </div>
      {/* Keyed on the task and the days, so a further slip refills the form. */}
      <DelayNoteForm
        key={`${item.id}-${days}`}
        direction="late"
        initial={{ days }}
        cancelLabel={t("delay.skip")}
        onCancel={onSkip}
        onSave={onSave}
      />
    </div>
  );
}
