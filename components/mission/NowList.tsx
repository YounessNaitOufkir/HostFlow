"use client";

import React from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { addDaysOnly, today } from "@/lib/gantt/dates";
import type { NowReason, RankedTask } from "@/lib/mission/score";
import type { TranslationKey } from "@/lib/i18n/types";
import type { Workspace } from "@/types";

interface NowListProps {
  tasks: RankedTask[];
  workspaces: Workspace[];
  todayIdx: number;
  onOpenTask: (boardId: string, itemId: string) => void;
}

type Tone = "danger" | "warning" | "info";

const TONE: Record<Tone, string> = {
  danger: "border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]",
  warning: "border-[var(--accent-warning)]/40 bg-[var(--accent-warning)]/15 text-[var(--text-primary)]",
  info: "border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/8 text-[var(--accent-primary)] dark:text-[var(--text-primary)]",
};

function chipOf(reason: NowReason, t: (key: TranslationKey, vars?: Record<string, string | number>) => string): { label: string; tone: Tone } {
  switch (reason.kind) {
    case "overdue":
      return { label: t("mission.reason.overdue", { days: reason.days }), tone: "danger" };
    case "dueToday":
      return { label: t("mission.reason.dueToday"), tone: "danger" };
    case "dueSoon":
      return { label: t("mission.reason.dueSoon", { days: reason.days }), tone: "warning" };
    case "critical":
      return { label: t("mission.reason.critical"), tone: "danger" };
    case "float":
      return { label: t("mission.reason.float", { days: reason.days }), tone: reason.days <= 0 ? "danger" : "warning" };
    case "unblocks":
      return {
        label: reason.count === 1 ? t("mission.reason.unblocksOne") : t("mission.reason.unblocks", { count: reason.count }),
        tone: "info",
      };
    case "followUp":
      return { label: t("mission.reason.followUp", { who: reason.who }), tone: "warning" };
  }
}

/** The top tasks, each with the reasons it is here and a way to open it. */
export default function NowList({ tasks, workspaces, todayIdx, onOpenTask }: NowListProps) {
  const { t, bcp47 } = useLanguage();
  const workspaceName = new Map(workspaces.map((w) => [w.id, w.name]));

  const dueLabel = (dueIdx: number | null): { text: string; late: boolean } | null => {
    if (dueIdx === null) return null;
    const diff = dueIdx - todayIdx;
    if (diff < 0) return { text: t("mission.due.late"), late: true };
    if (diff === 0) return { text: t("mission.waiting.today"), late: true };
    if (diff === 1) return { text: t("mission.due.tomorrow"), late: false };
    const date = addDaysOnly(today(), diff);
    return { text: date.toLocaleDateString(bcp47, { weekday: "long", day: "2-digit", month: "2-digit" }), late: false };
  };

  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] shadow-[var(--shadow-sm)]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-subtle)] px-5 py-3">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          {t("mission.tab.now")}
          <span className="font-normal text-[var(--text-secondary)]"> · {t("mission.now.subtitle", { count: tasks.length })}</span>
        </h2>
        <span className="text-[12px] text-[var(--text-tertiary)]">{t("mission.now.formula")}</span>
      </header>
      <ol>
        {tasks.map((task, index) => {
          const due = dueLabel(task.dueIdx);
          const where = [workspaceName.get(task.board.workspace_id ?? ""), task.board.name].filter(Boolean).join(" › ");
          return (
            <li key={task.item.id} className="flex items-start gap-3 border-t border-[var(--border-subtle)] px-5 py-4 first:border-t-0">
              <span
                aria-hidden
                className={`mt-0.5 grid h-6 w-7 shrink-0 place-items-center rounded-md text-[12px] font-bold text-[var(--text-on-primary)] ${
                  index === 0 ? "bg-[var(--accent-danger)]" : "bg-[var(--accent-primary)]"
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-[var(--text-primary)]">{task.item.name}</h3>
                <p className="mt-0.5 truncate text-[13px] text-[var(--text-secondary)]">{where}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("mission.now.why")}>
                  {task.reasons.map((reason, i) => {
                    const chip = chipOf(reason, t);
                    return (
                      <li key={i} className={`rounded-md border px-2 py-0.5 text-[12px] font-medium ${TONE[chip.tone]}`}>
                        {chip.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {due && (
                  <span className={`text-[12px] font-semibold ${due.late ? "text-[var(--accent-danger)]" : "text-[var(--text-secondary)]"}`}>
                    {due.text}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={t("mission.now.open", { name: task.item.name })}
                  onClick={() => onOpenTask(task.board.id, task.item.id)}
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-primary)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
                >
                  {t("mission.now.openShort")}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
