"use client";

import React from "react";
import { useT } from "@/components/LanguageProvider";
import type { AttentionTask } from "@/lib/dashboard/metrics";

/**
 * The tasks that are late or land this week, soonest first.
 *
 * This is the part a tile cannot do. "6 due this week" tells a reader there is
 * work without telling them which work, whose it is, or how late it already is,
 * so it prompts a second trip to the board. The list answers all three, and
 * replaced the Due-in-7-days tile rather than sitting beside it.
 */

interface AttentionListProps {
  tasks: AttentionTask[];
  /** How many qualify in total, so the list can own what it is not showing. */
  total: number;
  onOpenTask?: (id: string) => void;
}

const LATE = "#d03b3b";

export function AttentionList({ tasks, total, onOpenTask }: AttentionListProps) {
  const t = useT();

  const dueLabel = (offset: number) => {
    if (offset < -1) return t("dash.daysLate", { days: -offset });
    if (offset === -1) return t("dash.dayLate");
    if (offset === 0) return t("dash.dueToday");
    if (offset === 1) return t("dash.dueTomorrow");
    return t("dash.dueInDays", { days: offset });
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          {t("dash.attention")}
        </h3>
        <span className="text-[13px] text-gray-500 dark:text-gray-400">
          {t("dash.attentionHint")}
        </span>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-6">
          {t("dash.attentionEmpty")}
        </p>
      ) : (
        <>
          <ul>
            {tasks.map((task) => {
              // Today counts as urgent: it is the last chance, not a warning.
              const late = task.offsetDays <= 0;
              const row = (
                <>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: task.groupColor }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate font-medium text-gray-800 dark:text-gray-100">
                    {task.name}
                  </span>
                  {task.groupTitle && (
                    <span className="hidden sm:inline shrink-0 px-2.5 py-0.5 rounded-full text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 max-w-[9rem] truncate">
                      {task.groupTitle}
                    </span>
                  )}
                  <span className="hidden md:block w-32 shrink-0 truncate text-[13px] text-gray-500 dark:text-gray-400">
                    {task.ownerName ?? t("dash.unassigned")}
                  </span>
                  <span
                    className="w-28 shrink-0 text-right text-[13px] font-semibold"
                    style={late ? { color: LATE } : undefined}
                  >
                    <span className={late ? "" : "text-gray-500 dark:text-gray-400"}>
                      {dueLabel(task.offsetDays)}
                    </span>
                  </span>
                </>
              );

              return (
                <li
                  key={task.id}
                  className="border-t border-gray-100 dark:border-slate-800 first:border-t-0"
                >
                  {onOpenTask ? (
                    <button
                      type="button"
                      onClick={() => onOpenTask(task.id)}
                      className="w-full flex items-center gap-4 py-3 text-left rounded-md hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors px-1 -mx-1"
                    >
                      {row}
                    </button>
                  ) : (
                    <div className="flex items-center gap-4 py-3 px-1 -mx-1">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>

          {total > tasks.length && (
            <p className="pt-3 mt-1 border-t border-gray-100 dark:border-slate-800 text-[13px] text-gray-500 dark:text-gray-400">
              {t("dash.andMore", { count: total - tasks.length })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default AttentionList;
