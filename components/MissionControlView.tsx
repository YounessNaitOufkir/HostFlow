"use client";

import React, { useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { useWorkspaceGanttData } from "@/hooks/useWorkspaceGanttData";
import { collectDependencies } from "@/lib/gantt/dependencies";
import { dayIndex, today } from "@/lib/gantt/dates";
import { isOpenItem, waitingOnCellOf } from "@/lib/mission/fields";
import { buildWaitingList, type WaitingTask } from "@/lib/mission/waiting";
import { NOW_LIMIT, rankNow } from "@/lib/mission/score";
import { findOnSiteConflicts } from "@/lib/mission/conflicts";
import WaitingForList from "@/components/mission/WaitingForList";
import NowList from "@/components/mission/NowList";
import ConflictBanner from "@/components/mission/ConflictBanner";
import type { WorkspaceGanttUpdate } from "@/components/WorkspaceGanttView";
import type { Board, Item, Profile, Workspace } from "@/types";

interface MissionControlViewProps {
  boards: Board[];
  workspaces: Workspace[];
  profiles: Profile[];
  currentUserId: string;
  onOpenTask: (boardId: string, itemId: string) => void;
  /** Writes one cell through the same path as the Master Gantt, automations included. */
  onUpdateCell: (update: WorkspaceGanttUpdate) => void;
}

type WaitingFilter = "all" | "due";
type MissionTab = "now" | "waiting";
type Scope = "mine" | "team";

/** A small segmented control: one pressed option at a time. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-lg bg-[var(--surface-tertiary)] p-1">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`rounded-md px-3 py-1 text-[13px] font-semibold transition-colors ${
            value === key
              ? "bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * Pilotage: what costs money or a client if nobody acts today, across every
 * property at once. "Maintenant" ranks the top tasks with the reasons why;
 * "En attente de" lists who the team is waiting on.
 */
export default function MissionControlView({
  boards,
  workspaces,
  profiles,
  currentUserId,
  onOpenTask,
  onUpdateCell,
}: MissionControlViewProps) {
  const { t, bcp47 } = useLanguage();
  const { loading, error, items, itemLinks, automationsFor, refresh } = useWorkspaceGanttData(boards);
  const [tab, setTab] = useState<MissionTab>("now");
  const [scope, setScope] = useState<Scope>("mine");
  const [filter, setFilter] = useState<WaitingFilter>("all");

  // Read on every render, so an open tab moves on to the next day.
  const todayIdx = dayIndex(today());

  const boardsById = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards]);
  const deps = useMemo(() => collectDependencies(items, boardsById, itemLinks), [items, boardsById, itemLinks]);
  const groups = useMemo(() => buildWaitingList(items, boardsById, deps, todayIdx), [items, boardsById, deps, todayIdx]);

  const personId = scope === "mine" ? currentUserId : undefined;
  const nowTasks = useMemo(
    () => rankNow({ items, boardsById, deps, todayIdx }, { personId }).slice(0, NOW_LIMIT),
    [items, boardsById, deps, todayIdx, personId]
  );
  const conflicts = useMemo(() => {
    const all = findOnSiteConflicts(items, boardsById, todayIdx);
    return personId ? all.filter((c) => c.personId === personId) : all;
  }, [items, boardsById, todayIdx, personId]);

  // The open tasks directly behind each waiting task, named on its card.
  const blockedBy = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const map = new Map<string, Item[]>();
    for (const dep of deps) {
      const target = byId.get(dep.targetId);
      if (!target || !isOpenItem(target, boardsById.get(target.board_id))) continue;
      const list = map.get(dep.sourceId);
      if (list) list.push(target);
      else map.set(dep.sourceId, [target]);
    }
    return map;
  }, [items, deps, boardsById]);

  const dueCount = groups.filter((g) => g.anyDue).length;
  const shown = filter === "due" ? groups.filter((g) => g.anyDue) : groups;

  const markReceived = (task: WaitingTask) => {
    const column = waitingOnCellOf(task.item, task.board)?.column;
    if (!column) return;
    onUpdateCell({
      board: task.board,
      automations: automationsFor(task.board),
      items: items.filter((i) => i.board_id === task.board.id),
      itemLinks,
      itemId: task.item.id,
      columnId: column.id,
      value: null,
    });
    refresh();
  };

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-secondary)] px-4 py-6 sm:p-8">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] text-[var(--text-tertiary)]">
              {t("sidebar.pilotage")} · {t(tab === "now" ? "mission.tab.now" : "mission.tab.waiting")}
            </p>
            <h1 className="mt-1 max-w-3xl text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              {t(tab === "now" ? "mission.title" : "mission.waiting.title")}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {today().toLocaleDateString(bcp47, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tab === "now" && (
              <Segmented
                label={t("mission.scope.label")}
                value={scope}
                options={[
                  ["mine", t("mission.scope.mine")],
                  ["team", t("mission.scope.team")],
                ]}
                onChange={setScope}
              />
            )}
            <Segmented
              label={t("sidebar.pilotage")}
              value={tab}
              options={[
                ["now", t("mission.tab.now")],
                ["waiting", t("mission.tab.waiting")],
              ]}
              onChange={setTab}
            />
          </div>
        </header>

        {error ? (
          <div role="alert" className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-5 text-sm text-[var(--accent-danger)]">
            {t("mission.error")}
            <button type="button" onClick={refresh} className="ml-3 font-semibold underline">
              {t("mission.retry")}
            </button>
          </div>
        ) : loading ? (
          <div aria-busy="true" aria-label={t("mission.loading")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-[var(--surface-tertiary)]" />
            ))}
          </div>
        ) : tab === "now" ? (
          <>
            <ConflictBanner
              conflicts={conflicts}
              profiles={profiles}
              workspaces={workspaces}
              todayIdx={todayIdx}
              onOpenTask={onOpenTask}
            />
            {nowTasks.length ? (
              <NowList tasks={nowTasks} workspaces={workspaces} todayIdx={todayIdx} onOpenTask={onOpenTask} />
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-primary)] p-8 text-center text-sm text-[var(--text-secondary)]">
                {t("mission.empty.now")}
              </p>
            )}
          </>
        ) : groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-primary)] p-8 text-center text-sm text-[var(--text-secondary)]">
            {t("mission.empty.waiting")}
          </p>
        ) : (
          <>
            <div role="group" aria-label={t("mission.tab.waiting")} className="flex flex-wrap gap-2">
              {(
                [
                  ["all", t("mission.filter.all", { count: groups.length })],
                  ["due", t("mission.filter.due", { count: dueCount })],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                  className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    filter === key
                      ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--text-on-primary)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-primary)] text-[var(--text-primary)] hover:bg-[var(--surface-tertiary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <WaitingForList
              groups={shown}
              workspaces={workspaces}
              blockedBy={blockedBy}
              todayIdx={todayIdx}
              onOpenTask={onOpenTask}
              onMarkReceived={markReceived}
            />
          </>
        )}
      </div>
    </div>
  );
}
