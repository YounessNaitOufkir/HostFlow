"use client";

import React, { useMemo, useState } from "react";
import { displayStatus } from "@/lib/i18n/labels";
import { Board, Group, Item, Profile } from "@/types";
import { AlertTriangle, CalendarClock, CheckCircle, ListTodo } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { RingChart, Ring, RingCenter } from "@/components/ui/RingChart";
import { StatTile } from "@/components/dashboard/StatTile";
import { DistributionCard } from "@/components/dashboard/DistributionCard";
import { AttentionList } from "@/components/dashboard/AttentionList";
import { DashboardFilters } from "@/components/dashboard/DashboardFilters";
import { computeDashboardMetrics, assigneeIdOf } from "@/lib/dashboard/metrics";
import {
  applyDashboardFilter,
  EMPTY_DASHBOARD_FILTER,
  type DashboardFilter,
} from "@/lib/dashboard/filter";

interface DashboardViewProps {
  board: Board | null;
  groups: Group[];
  items: Item[];
  profiles: Profile[];
  /** Opens a task from the attention list, so the list is a way in, not a report. */
  onOpenTask?: (itemId: string) => void;
}

export default function DashboardView({
  board,
  groups,
  items,
  profiles,
  onOpenTask,
}: DashboardViewProps) {
  const t = useT();
  const [filter, setFilter] = useState<DashboardFilter>(EMPTY_DASHBOARD_FILTER);

  const filtered = useMemo(
    () => applyDashboardFilter(board, items, filter),
    [board, items, filter]
  );

  const metrics = useMemo(
    () => computeDashboardMetrics(board, groups, filtered, profiles),
    [board, groups, filtered, profiles]
  );

  // Offered in the filter menu: only people who actually carry work here, so the
  // list is not every profile in the account.
  const assigneeIds = useMemo(() => {
    if (!board) return [];
    const seen = new Set<string>();
    for (const item of items) {
      const id = assigneeIdOf(board, item);
      if (id) seen.add(id);
    }
    return [...seen];
  }, [board, items]);

  // The ring reads each slice against the whole board, which is what makes the
  // rings comparable to one another rather than each filling its own track.
  const ringData = useMemo(
    () =>
      metrics.statuses.map((s) => ({
        label: displayStatus(t, s.label),
        value: s.value,
        maxValue: metrics.total,
        color: s.color,
      })),
    [metrics.statuses, metrics.total, t]
  );

  if (!board) return null;

  return (
    <div className="flex-1 overflow-auto bg-[#F4F6F8] dark:bg-[#181b34] p-8">
      <div className="max-w-[1200px] mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
            {t("dash.title", { board: board.name })}
          </h1>
          {/* One filter row above everything it scopes, never inside a card. */}
          <DashboardFilters
            filter={filter}
            onChange={setFilter}
            assigneeIds={assigneeIds}
            profiles={profiles}
            groups={groups}
            showing={{ shown: filtered.length, total: items.length }}
          />
        </div>

        {items.length === 0 ? (
          <EmptyState title={t("dash.emptyTitle")} body={t("dash.emptyBody")} />
        ) : filtered.length === 0 ? (
          <EmptyState title={t("dash.noMatchTitle")} body={t("dash.noMatchBody")} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile label={t("dash.totalTasks")} value={metrics.total} icon={ListTodo} tone="info" />
              <StatTile
                label={t("dash.done")}
                value={metrics.done}
                detail={t("dash.doneDetail", { pct: metrics.donePct })}
                icon={CheckCircle}
                tone="good"
              />
              <StatTile
                label={t("dash.working")}
                value={metrics.working}
                icon={CalendarClock}
                tone="warning"
              />
              <StatTile
                label={t("dash.stuck")}
                value={metrics.stuck}
                icon={AlertTriangle}
                tone="critical"
              />
            </div>

            {metrics.undated > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-4">
                {t("dash.undated", { count: metrics.undated })}
              </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-6">
                  {t("dash.statusBreakdown")}
                </h3>

                <div className="flex flex-col 2xl:flex-row items-center gap-8 flex-1">
                  <div className="h-64 w-64 md:h-72 md:w-72 flex-shrink-0">
                    {ringData.length > 0 ? (
                      <RingChart data={ringData} strokeWidth={14} ringGap={6} baseInnerRadius={55}>
                        {ringData.map((slice, index) => (
                          <Ring key={slice.label} index={index} />
                        ))}
                        <RingCenter defaultLabel={t("dash.tasks")} />
                      </RingChart>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        {t("dash.noStatuses")}
                      </div>
                    )}
                  </div>

                  <ul className="flex flex-col justify-center gap-5 w-full flex-1">
                    {metrics.statuses.map((s) => (
                      <li key={s.label} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center text-gray-700 dark:text-gray-200 font-medium min-w-0">
                            {/* Identity comes from the mark beside the text,
                                never from colouring the text itself. */}
                            <span
                              className="w-3 h-3 rounded-full mr-3 shrink-0"
                              style={{ backgroundColor: s.color }}
                            />
                            <span className="truncate">{displayStatus(t, s.label)}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                              {s.value}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400 w-9 text-right tabular-nums">
                              {s.pct}%
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-800/80 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <DistributionCard
                byAssignee={metrics.byAssignee}
                byGroup={metrics.byGroup}
                emptyPeople={t("dash.noAssignees")}
                emptyGroups={t("dash.noGroupData")}
              />
            </div>

            <AttentionList
              tasks={metrics.attention}
              total={metrics.attentionTotal}
              onOpenTask={onOpenTask}
            />
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-12 text-center">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{body}</p>
    </div>
  );
}
