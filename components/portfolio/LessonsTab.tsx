"use client";

import React, { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { Board, Item, Workspace } from "@/types";
import { useDelayNotes } from "@/hooks/useDelayNotes";
import { usePortfolioGroups } from "@/hooks/useLessonsData";
import {
  computeLessons,
  DEFAULT_LESSONS_FILTER,
  type LessonsFilter,
  type LessonsPeriod,
  type TaskType,
} from "@/lib/dashboard/lessons";
import { DELAY_CATEGORY_KEYS } from "@/lib/delays";

interface LessonsTabProps {
  workspaces: Workspace[];
  /** The Portfolio overview's boards: shared, and the viewer can open them. */
  boards: Board[];
  items: Item[];
  onOpenReview: (board: Board) => void;
}

const FILTER_KEY = "hostflow_lessons_filter";
const PERIODS: LessonsPeriod[] = ["6m", "12m", "all"];
/** One hue for every bar: these charts show how much, never which. */
const BAR = "#6366f1";
const HATCH = "repeating-linear-gradient(135deg, #9ca3af 0 4px, #d1d5db 4px 8px)";

function readFilter(): LessonsFilter {
  try {
    const raw = JSON.parse(localStorage.getItem(FILTER_KEY) ?? "null");
    if (raw && typeof raw === "object") {
      return {
        includeInProgress: raw.includeInProgress === true,
        period: PERIODS.includes(raw.period) ? raw.period : DEFAULT_LESSONS_FILTER.period,
        workspaceId: typeof raw.workspaceId === "string" ? raw.workspaceId : null,
      };
    }
  } catch {
    /* a blocked or empty store is the default filter */
  }
  return DEFAULT_LESSONS_FILTER;
}

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * What finished projects teach the next one: the reasons that cost the most
 * days, the kinds of task that keep running long, and how each project ended
 * against its plan.
 */
export default function LessonsTab({ workspaces, boards, items, onOpenReview }: LessonsTabProps) {
  const { t } = useLanguage();
  const [filter, setFilterState] = useState<LessonsFilter>(readFilter);
  const setFilter = (next: LessonsFilter) => {
    setFilterState(next);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const groups = usePortfolioGroups(boards);
  const boardIds = useMemo(() => boards.map((b) => b.id), [boards]);
  const { notes } = useDelayNotes(boardIds);
  const lessons = useMemo(
    () => computeLessons({ workspaces, boards, groups, items, notes, filter }),
    [workspaces, boards, groups, items, notes, filter]
  );

  const workspaceOptions = useMemo(() => {
    const ids = new Set(boards.map((b) => b.workspace_id));
    return workspaces.filter((w) => ids.has(w.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [workspaces, boards]);
  // A remembered workspace that is no longer in the portfolio falls back to all.
  const workspaceGone = filter.workspaceId !== null && !workspaceOptions.some((w) => w.id === filter.workspaceId);
  if (workspaceGone) setFilterState({ ...filter, workspaceId: null });

  const days = (n: number) => (Math.abs(n) === 1 ? t("review.dayOne") : t("review.days", { days: Math.abs(Math.round(n * 10) / 10) }));
  const reason = (c: TaskType["topReason"]) => (c ? t(DELAY_CATEGORY_KEYS[c]) : null);
  const { projects } = lessons;

  const filters = (
    <div className="flex flex-wrap items-center gap-2" aria-label={t("lessons.filters")}>
      <button
        type="button"
        aria-pressed={filter.includeInProgress}
        onClick={() => setFilter({ ...filter, includeInProgress: !filter.includeInProgress })}
        className={`px-2.5 py-1.5 rounded-lg border text-[12.5px] font-semibold transition-colors ${
          filter.includeInProgress
            ? "border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300"
            : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 bg-white dark:bg-slate-900 hover:border-gray-300"
        }`}
      >
        {t("lessons.includeInProgress")}
      </button>
      <label className="sr-only" htmlFor="lessons-period">{t("lessons.period")}</label>
      <select
        id="lessons-period"
        value={filter.period}
        onChange={(e) => setFilter({ ...filter, period: e.target.value as LessonsPeriod })}
        className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] font-semibold text-gray-700 dark:text-gray-200"
      >
        <option value="6m">{t("lessons.period6m")}</option>
        <option value="12m">{t("lessons.period12m")}</option>
        <option value="all">{t("lessons.periodAll")}</option>
      </select>
      <label className="sr-only" htmlFor="lessons-workspace">{t("lessons.workspace")}</label>
      <select
        id="lessons-workspace"
        value={filter.workspaceId ?? ""}
        onChange={(e) => setFilter({ ...filter, workspaceId: e.target.value || null })}
        className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] font-semibold text-gray-700 dark:text-gray-200 max-w-[16rem]"
      >
        <option value="">{t("lessons.allWorkspaces")}</option>
        {workspaceOptions.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
    </div>
  );

  if (projects.length === 0) {
    return (
      <div className="space-y-4">
        {filters}
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-8 text-center">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{t("lessons.emptyTitle")}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
            {t(filter.includeInProgress || filter.workspaceId || filter.period !== "all" ? "lessons.emptyFiltered" : "lessons.emptyBody")}
          </p>
        </div>
      </div>
    );
  }

  const maxLost = Math.max(1, lessons.unexplainedTotal, ...lessons.lostByReason.map((r) => r.days));
  const maxRun = Math.max(1, ...lessons.taskTypes.flatMap((type) => type.runs.map((r) => r.actualDays)));
  const maxSpan = Math.max(1, ...projects.flatMap((p) => [p.plannedDays, p.actualDays]));
  const slipAvg = lessons.finishSlipAvg ?? 0;
  const explainedPct = lessons.daysLost > 0 ? Math.round((lessons.explainedDays / lessons.daysLost) * 100) : null;

  return (
    <div className="space-y-5">
      {filters}

      {/* ---- the headline numbers */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label={t("lessons.summary")}>
        <Tile label={t("lessons.reviewed")} value={String(projects.length)} sub={t(filter.includeInProgress ? "lessons.reviewedSubAll" : "lessons.reviewedSub")} />
        <Tile
          label={t("lessons.finishVsPlan")}
          value={Math.abs(slipAvg) < 0.05 ? t("review.onTime") : `${slipAvg > 0 ? "+" : "−"}${days(slipAvg)}`}
          valueClassName={slipAvg > 0.05 ? "text-red-600 dark:text-red-400" : slipAvg < -0.05 ? "text-emerald-600 dark:text-emerald-400" : undefined}
          sub={t("lessons.onTimeOf", { count: lessons.onTimeCount, total: projects.length })}
        />
        <Tile label={t("lessons.daysLost")} value={String(lessons.daysLost)} sub={t("lessons.acrossLate", { count: lessons.lateTaskCount })} />
        <Tile
          label={t("lessons.explained")}
          value={explainedPct === null ? "—" : `${explainedPct}%`}
          sub={explainedPct === null ? t("lessons.nothingLost") : t("lessons.explainedOf", { explained: lessons.explainedDays, total: lessons.daysLost })}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5">
        {/* ---- days lost by reason */}
        <Card title={t("review.lostByReason")} subtitle={t("lessons.lostHint")}>
          {lessons.lostByReason.length === 0 && lessons.unexplainedTotal === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("lessons.noLost")}</p>
          ) : (
            <>
              <ul className="space-y-2.5" aria-label={t("review.lostByReason")}>
                {lessons.lostByReason.map((row) => (
                  <Bar
                    key={row.category}
                    label={t(DELAY_CATEGORY_KEYS[row.category])}
                    value={row.days}
                    max={maxLost}
                    valueLabel={days(row.days)}
                    title={`${t(DELAY_CATEGORY_KEYS[row.category])}: ${row.byProject.map((p) => `${p.name} ${p.days}`).join(", ")}`}
                  />
                ))}
                {lessons.unexplainedTotal > 0 && (
                  <Bar label={t("review.notExplained")} value={lessons.unexplainedTotal} max={maxLost} valueLabel={days(lessons.unexplainedTotal)} unexplained />
                )}
              </ul>
              <p className="mt-3 text-[12px] text-gray-500 dark:text-gray-400">{t("lessons.overlapHint")}</p>
            </>
          )}
        </Card>

        {/* ---- advice for the next project */}
        <Card title={t("lessons.adviceTitle")} subtitle={t("lessons.adviceHint")}>
          {lessons.advice.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("lessons.adviceNone")}</p>
          ) : (
            <ul className="space-y-2.5">
              {lessons.advice.map((type) => (
                <li key={type.key} className="border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5">
                  <p className="text-[13.5px] font-bold text-gray-900 dark:text-gray-100">
                    {t("lessons.advicePlan", { name: type.name, actual: Math.round(type.actualAvg), planned: Math.round(type.plannedAvg) })}
                  </p>
                  <p className="text-[12.5px] text-gray-600 dark:text-gray-300 mt-0.5">
                    {t("lessons.adviceWhy", { over: one(type.overrunAvg) })}
                    {type.topReason && ` ${t("lessons.adviceReason", { reason: reason(type.topReason)! })}`}
                  </p>
                  <p className="text-[11.5px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {t("lessons.adviceFrom", { projects: type.projectCount, late: type.lateRuns, runs: type.runs.length })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ---- task types */}
      <Card title={t("lessons.typesTitle")} subtitle={t("lessons.typesHint")}>
        {lessons.taskTypes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("lessons.typesNone")}</p>
        ) : (
          <TaskTypesTable types={lessons.taskTypes} maxRun={maxRun} reason={reason} />
        )}
      </Card>

      {/* ---- projects compared */}
      <Card
        title={t("lessons.projectsTitle")}
        subtitle={t("lessons.projectsHint")}
        aside={
          <div className="flex gap-3 text-[11.5px] text-gray-500 dark:text-gray-400" aria-hidden>
            <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-1.5 rounded bg-gray-300 dark:bg-slate-600" />{t("lessons.legendPlanned")}</span>
            <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-1.5 rounded" style={{ background: BAR }} />{t("lessons.legendActual")}</span>
            <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-1.5 rounded bg-red-500" />{t("lessons.legendLate")}</span>
          </div>
        }
      >
        <ul>
          {projects.map((p) => {
            const slip = p.review.finishSlip;
            return (
              <li
                key={p.board.id}
                className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_5.5rem_minmax(0,1fr)_5rem] gap-x-3 gap-y-1.5 items-center py-2.5 border-t first:border-t-0 border-gray-100 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <div className="font-bold text-[13.5px] text-gray-900 dark:text-gray-100 truncate">{p.workspace?.name ?? p.board.name}</div>
                  <div className="text-[11.5px] text-gray-400 dark:text-gray-500 truncate">
                    {p.board.name}
                    {!p.review.finished && ` · ${t("lessons.inProgress")}`}
                  </div>
                </div>
                <div
                  className="relative h-4 col-span-2 md:col-span-1 order-last md:order-none"
                  aria-label={t("lessons.spanLabel", { planned: p.plannedDays, actual: p.actualDays })}
                  title={t("lessons.spanLabel", { planned: p.plannedDays, actual: p.actualDays })}
                >
                  <span className="absolute left-0 top-[9px] h-[5px] rounded bg-gray-300 dark:bg-slate-600" style={{ width: `${(p.plannedDays / maxSpan) * 100}%` }} />
                  <span
                    className={`absolute left-0 top-[1px] h-[7px] rounded ${slip > 0 ? "bg-red-500" : ""}`}
                    style={{ width: `${(p.actualDays / maxSpan) * 100}%`, background: slip > 0 ? undefined : BAR }}
                  />
                </div>
                <div className={`text-[13px] font-bold tabular-nums ${slip > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {slip > 0 ? t("review.late", { days: days(slip) }) : slip < 0 ? t("review.early", { days: days(slip) }) : t("review.onTime")}
                </div>
                <div className="hidden md:block min-w-0">
                  {p.explainedPct !== null ? (
                    <>
                      <div className="text-[12px] text-gray-600 dark:text-gray-300 truncate">
                        {t("lessons.pctExplained", { pct: p.explainedPct })}
                        {p.topReason && <> · <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800">{reason(p.topReason)}</span></>}
                      </div>
                      <div className="h-[5px] mt-1 rounded bg-gray-100 dark:bg-slate-800 overflow-hidden">
                        <i className="block h-full bg-emerald-500" style={{ width: `${p.explainedPct}%` }} />
                      </div>
                    </>
                  ) : (
                    <span className="text-[12px] text-gray-400">{t("lessons.nothingLost")}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenReview(p.board)}
                  className="col-start-2 md:col-start-auto justify-self-end text-[12.5px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t("lessons.openReview")}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function Tile({ label, value, sub, valueClassName = "text-gray-900 dark:text-gray-100" }: { label: string; value: string; sub: string; valueClassName?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-3">
      <div className="text-[12px] font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-[22px] font-extrabold tabular-nums mt-0.5 ${valueClassName}`}>{value}</div>
      <div className="text-[12px] text-gray-400 dark:text-gray-500">{sub}</div>
    </div>
  );
}

function Card({ title, subtitle, aside, children }: { title: string; subtitle?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 mb-3.5">
        <div>
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle && <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 max-w-[70ch]">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Bar({ label, value, max, valueLabel, title, unexplained = false }: { label: string; value: number; max: number; valueLabel: string; title?: string; unexplained?: boolean }) {
  return (
    <li
      className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,11rem)_1fr_4.5rem] items-center gap-x-3 gap-y-1"
      title={title ?? `${label}: ${valueLabel}`}
    >
      <span className={`text-[13px] truncate ${unexplained ? "italic text-gray-500 dark:text-gray-400" : "text-gray-800 dark:text-gray-100"}`}>{label}</span>
      <span className="order-last col-span-2 sm:order-none sm:col-span-1 h-3 rounded-r bg-gray-100 dark:bg-slate-800 overflow-hidden">
        <span className="block h-full rounded-r" style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: unexplained ? HATCH : BAR }} />
      </span>
      <span className="text-[13px] font-bold tabular-nums text-right text-gray-700 dark:text-gray-200">{valueLabel}</span>
    </li>
  );
}

function TaskTypesTable({ types, maxRun, reason }: { types: TaskType[]; maxRun: number; reason: (c: TaskType["topReason"]) => string | null }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState<string | null>(types[0]?.key ?? null);
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
            <th className="font-semibold px-1.5 pb-2">{t("review.colTask")}</th>
            <th className="font-semibold px-1.5 pb-2 text-right">{t("lessons.colPlanned")}</th>
            <th className="font-semibold px-1.5 pb-2 text-right">{t("lessons.colActual")}</th>
            <th className="font-semibold px-1.5 pb-2 text-right">{t("lessons.colOver")}</th>
            <th className="font-semibold px-1.5 pb-2">{t("lessons.colRuns")}</th>
            <th className="font-semibold px-1.5 pb-2">{t("lessons.colReason")}</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {types.map((type) => {
            const expanded = open === type.key;
            const pct = Math.round((type.overrunAvg / Math.max(0.1, type.plannedAvg)) * 100);
            return (
              <React.Fragment key={type.key}>
                <tr
                  tabIndex={0}
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : type.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpen(expanded ? null : type.key);
                    }
                  }}
                  className="cursor-pointer border-t border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  <td className="px-1.5 py-2.5">
                    <div className="font-bold text-gray-900 dark:text-gray-100">{type.name}</div>
                    <div className="text-[11.5px] text-gray-400 dark:text-gray-500">{t("lessons.projectsCount", { count: type.projectCount })}</div>
                  </td>
                  <td className="px-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200">{one(type.plannedAvg)} {t("gantt.dayUnit")}</td>
                  <td className="px-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200">{one(type.actualAvg)} {t("gantt.dayUnit")}</td>
                  <td className={`px-1.5 text-right tabular-nums font-bold ${type.overrunAvg >= 1 ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-200"}`}>
                    +{one(type.overrunAvg)} {t("gantt.dayUnit")} <span className="text-[11.5px] font-normal text-gray-400">({pct}%)</span>
                  </td>
                  <td className="px-1.5">
                    <div className="flex items-end gap-1 h-[26px]" aria-label={t("lessons.runsLabel")}>
                      {type.runs.map((run) => (
                        <span
                          key={run.item.id}
                          title={`${run.project.workspace?.name ?? run.project.board.name}: ${run.actualDays} ${t("gantt.dayUnit")}`}
                          className={`w-2 rounded-t-sm ${run.actualDays <= run.plannedDays ? "bg-emerald-500" : ""}`}
                          style={{ height: `${Math.max(3, Math.round((run.actualDays / maxRun) * 26))}px`, background: run.actualDays <= run.plannedDays ? undefined : BAR }}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-1.5">
                    {type.topReason ? (
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[11.5px] text-gray-700 dark:text-gray-200 whitespace-nowrap">{reason(type.topReason)}</span>
                    ) : (
                      <span className="text-[11.5px] text-gray-400">{t("review.notExplained")}</span>
                    )}
                  </td>
                  <td className="px-1.5 text-right">
                    <ChevronRight size={14} className={`inline text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={7} className="bg-gray-50 dark:bg-slate-800/40 px-3 py-3">
                      <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
                        {type.runs.map((run) => {
                          const over = run.actualDays - run.plannedDays;
                          return (
                            <div key={run.item.id} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-[12.5px]">
                              <div className="font-bold text-gray-900 dark:text-gray-100">
                                {run.project.workspace?.name ?? run.project.board.name}{" "}
                                <span className={`tabular-nums ${over > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                  {over > 0 ? `+${over}` : over}
                                  {t("gantt.dayUnit")}
                                </span>
                              </div>
                              <div className="text-gray-600 dark:text-gray-300 mt-0.5">
                                {run.notes.length > 0
                                  ? run.notes.map((n) => n.note || reason(n.category)).join(" · ")
                                  : over > 0
                                    ? t("review.notExplained")
                                    : t("lessons.onPlan")}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
