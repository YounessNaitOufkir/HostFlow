"use client";

import React from "react";
import { Lightbulb, X } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { DELAY_CATEGORY_KEYS } from "@/lib/delays";
import type { TaskType } from "@/lib/dashboard/lessons";

export interface PlanningHintRequest {
  itemId: string;
  name: string;
  plannedDays: number;
  suggestedDays: number;
  type: TaskType;
  /** Writes the longer length: same start, later end. */
  apply: () => void;
}

interface PlanningHintProps {
  hint: PlanningHintRequest;
  onClose: () => void;
}

/**
 * Past projects speaking up while a task is planned: this kind of task has
 * usually taken longer than the length just set. Only a suggestion - nothing
 * changes unless the person asks for it.
 */
export function PlanningHint({ hint, onClose }: PlanningHintProps) {
  const t = useT();
  const { type } = hint;
  return (
    <div
      role="dialog"
      aria-label={t("lessons.adviceTitle")}
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[140] w-[440px] max-w-[calc(100vw-32px)] rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-[#2a2312] shadow-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <Lightbulb size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-amber-950 dark:text-amber-50">
            {t("hint.title", { name: hint.name, days: hint.suggestedDays, planned: hint.plannedDays })}
          </p>
          <p className="text-[12.5px] text-amber-900 dark:text-amber-200/90 mt-0.5">
            {t("hint.body", { projects: type.projectCount, over: (Math.round(type.overrunAvg * 10) / 10).toFixed(1) })}
            {type.topReason && ` ${t("hint.reason", { reason: t(DELAY_CATEGORY_KEYS[type.topReason]) })}`}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={() => {
                hint.apply();
                onClose();
              }}
              className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
            >
              {t("hint.apply", { days: hint.suggestedDays })}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-100 hover:bg-amber-100/60 dark:hover:bg-slate-800"
            >
              {t("hint.keep", { days: hint.plannedDays })}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("hint.keep", { days: hint.plannedDays })}
          className="p-1 rounded-md text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40 shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
