"use client";

import React from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { dayIndex, parseDateOnly } from "@/lib/gantt/dates";
import type { WaitingGroup, WaitingTask } from "@/lib/mission/waiting";
import type { Item, Workspace } from "@/types";

interface WaitingForListProps {
  groups: WaitingGroup[];
  workspaces: Workspace[];
  /** Open tasks directly downstream of each waiting task, for the "Blocks" box. */
  blockedBy: Map<string, Item[]>;
  todayIdx: number;
  onOpenTask: (boardId: string, itemId: string) => void;
  onMarkReceived: (task: WaitingTask) => void;
}

/** How many blocked task names a card lists before "+N". */
const BLOCKED_SHOWN = 3;

/** One card per person or company being waited on. */
export default function WaitingForList({ groups, workspaces, blockedBy, todayIdx, onOpenTask, onMarkReceived }: WaitingForListProps) {
  const workspaceName = new Map(workspaces.map((w) => [w.id, w.name]));
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <article
          key={group.who}
          aria-label={group.who}
          className="flex flex-col gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-5 shadow-[var(--shadow-sm)]"
        >
          <header className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent-primary)] text-sm font-semibold text-[var(--text-on-primary)]"
            >
              {group.who.charAt(0).toLocaleUpperCase()}
            </span>
            <h3 className="min-w-0 flex-1 truncate pt-1.5 font-semibold text-[var(--text-primary)]">{group.who}</h3>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {group.workspaceIds.map((id) => (
                <span
                  key={id}
                  className="rounded-md bg-[var(--surface-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
                >
                  {workspaceName.get(id) ?? ""}
                </span>
              ))}
            </div>
          </header>
          {group.tasks.map((task) => (
            <WaitingTaskBlock
              key={task.item.id}
              task={task}
              blocked={blockedBy.get(task.item.id) ?? []}
              todayIdx={todayIdx}
              onOpenTask={onOpenTask}
              onMarkReceived={onMarkReceived}
            />
          ))}
        </article>
      ))}
    </div>
  );
}

function WaitingTaskBlock({
  task,
  blocked,
  todayIdx,
  onOpenTask,
  onMarkReceived,
}: {
  task: WaitingTask;
  blocked: Item[];
  todayIdx: number;
  onOpenTask: (boardId: string, itemId: string) => void;
  onMarkReceived: (task: WaitingTask) => void;
}) {
  const { t, bcp47 } = useLanguage();
  const days = todayIdx - dayIndex(parseDateOnly(task.since)!);
  const sinceLabel = days <= 0 ? t("mission.waiting.today") : t("mission.waiting.days", { count: days });

  const followUp = task.followUp ? parseDateOnly(task.followUp)! : null;
  const followUpLabel = !followUp
    ? "-"
    : dayIndex(followUp) === todayIdx
      ? t("mission.waiting.today")
      : followUp.toLocaleDateString(bcp47, { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-3 first-of-type:border-t-0 first-of-type:pt-0">
      <button
        type="button"
        onClick={() => onOpenTask(task.board.id, task.item.id)}
        className="text-left text-[14px] leading-snug text-[var(--text-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent-secondary)]"
      >
        {task.item.name}
      </button>
      <dl className="grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <dt className="text-[var(--text-tertiary)]">{t("mission.waiting.since")}</dt>
          <dd className="font-semibold text-[var(--text-primary)]">{sinceLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-tertiary)]">{t("mission.waiting.followUp")}</dt>
          <dd className={`font-semibold ${task.followUpDue ? "text-[var(--accent-danger)]" : "text-[var(--text-primary)]"}`}>
            {followUpLabel}
          </dd>
        </div>
      </dl>
      {task.blocks > 0 && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            {t("mission.waiting.blocks", { count: task.blocks })}
          </div>
          <ul className="mt-1 space-y-0.5 text-[12.5px] text-[var(--accent-danger)]">
            {blocked.slice(0, BLOCKED_SHOWN).map((b) => (
              <li key={b.id} className="truncate">
                {b.name}
              </li>
            ))}
            {blocked.length > BLOCKED_SHOWN && (
              <li className="text-[var(--text-tertiary)]">{t("mission.waiting.more", { count: blocked.length - BLOCKED_SHOWN })}</li>
            )}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={() => onMarkReceived(task)}
        className="self-start rounded-lg border border-[var(--border-default)] bg-[var(--surface-primary)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
      >
        {t("mission.waiting.markReceived")}
      </button>
    </div>
  );
}
