"use client";

import React, { useMemo, useState } from "react";
import { Board, Group, Item, Profile } from "@/types";
import { AlertTriangle, CalendarClock, CheckCircle, ListTodo } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { StatTile } from "@/components/dashboard/StatTile";
import { BarList } from "@/components/dashboard/BarList";
import { DashboardFilters } from "@/components/dashboard/DashboardFilters";
import {
  computeDashboardMetrics,
  assigneeIdOf,
  hexFromStatusColor,
} from "@/lib/dashboard/metrics";
import {
  applyDashboardFilter,
  EMPTY_DASHBOARD_FILTER,
  type DashboardFilter,
} from "@/lib/dashboard/filter";
import { STATUS_OPTIONS } from "@/types";

interface DashboardViewProps {
  board: Board | null;
  groups: Group[];
  items: Item[];
  profiles: Profile[];
}

/** The series hue, matching BarList. Used where a chart needs it inline. */
const SERIES = "#2a78d6";

export default function DashboardView({ board, groups, items, profiles }: DashboardViewProps) {
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

  // The completion meter wears the board's own "done" colour, because it plots
  // exactly the quantity the Done row below it reports. A different hue for the
  // same number would read as a different measure.
  const doneColor = useMemo(() => {
    const done = metrics.statuses.find((s) => s.label.toLowerCase().includes("done"));
    return (
      done?.color ??
      hexFromStatusColor(STATUS_OPTIONS.find((o) => o.label === "Done")?.color) ??
      SERIES
    );
  }, [metrics.statuses]);

  if (!board) return null;

  return (
    <div className="flex-1 overflow-auto bg-[#F4F6F8] dark:bg-[#181b34] p-8">
      <div className="max-w-[1200px] mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
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
              <StatTile label={t("dash.totalTasks")} value={metrics.total} icon={ListTodo} />
              <StatTile
                label={t("dash.done")}
                value={metrics.done}
                detail={t("dash.doneDetail", { pct: metrics.donePct })}
                icon={CheckCircle}
                tone="good"
              />
              <StatTile
                label={t("dash.overdue")}
                value={metrics.overdue}
                detail={t("dash.overdueDetail")}
                icon={AlertTriangle}
                tone={metrics.overdue > 0 ? "critical" : "neutral"}
              />
              <StatTile
                label={t("dash.dueSoon")}
                value={metrics.dueSoon}
                detail={t("dash.dueSoonDetail")}
                icon={CalendarClock}
                tone={metrics.dueSoon > 0 ? "warning" : "neutral"}
              />
            </div>

            {metrics.undated > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("dash.undated", { count: metrics.undated })}
              </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title={t("dash.progress")}>
                {metrics.statuses.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-6">
                    {t("dash.noStatuses")}
                  </p>
                ) : (
                  <>
                    {/* The one hero figure on this view. Same sans as everything
                        else, proportional digits. */}
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-semibold text-gray-900 dark:text-gray-50">
                        {metrics.donePct}%
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {t("dash.complete")}
                      </span>
                    </div>

                    {/* Meter: the unfilled track is the same hue, lightened, so
                        the state reads across the whole bar. */}
                    <div
                      className="mt-4 h-2.5 rounded-full overflow-hidden"
                      style={{ background: `${doneColor}26` }}
                      role="img"
                      aria-label={t("dash.doneDetail", { pct: metrics.donePct })}
                    >
                      <div
                        className="h-full rounded-r"
                        style={{ width: `${metrics.donePct}%`, background: doneColor }}
                      />
                    </div>

                    <ul className="mt-6 space-y-3">
                      {metrics.statuses.map((s) => (
                        <li key={s.label} className="flex items-center gap-3 text-sm">
                          {/* Identity comes from the mark beside the text, never
                              from colouring the text itself. */}
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: s.color }}
                          />
                          <span className="flex-1 truncate text-gray-700 dark:text-gray-200">
                            {s.label}
                          </span>
                          <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">
                            {s.value}
                          </span>
                          <span className="w-10 text-right tabular-nums text-gray-500 dark:text-gray-400">
                            {s.pct}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>

              <div className="space-y-6">
                <Card title={t("dash.byAssignee")}>
                  <BarList data={metrics.byAssignee} emptyMessage={t("dash.noAssignees")} />
                </Card>
                <Card title={t("dash.byGroup")}>
                  <BarList data={metrics.byGroup} emptyMessage={t("dash.noGroupData")} />
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-100 dark:border-slate-800">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-5">{title}</h3>
      {children}
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
