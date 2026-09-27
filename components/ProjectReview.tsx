"use client";

import React, { useMemo } from "react";
import { format } from "date-fns";
import { CalendarCheck, Flag, Lightbulb, Plus, Route, Timer, TrendingDown } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { Board, Group, Item, ItemLink, Profile } from "@/types";
import { useDelayNotes } from "@/hooks/useDelayNotes";
import { buildProjectReview, type ReviewTask } from "@/lib/projectReview";
import { DELAY_CATEGORY_KEYS } from "@/lib/delays";

interface ProjectReviewProps {
  board: Board;
  groups: Group[];
  /** Every task on the board: a review is never of a filtered view. */
  items: Item[];
  itemLinks?: ItemLink[];
  profiles?: Profile[];
  onOpenItem: (item: Item) => void;
  onGoToGantt: () => void;
}

/** One hue for every bar: the chart shows how much, not which. */
const BAR = "#6366f1";

/**
 * How a board went against its plan, and why - read once a project is over
 * (or while it runs) so the next one is planned with this one's lessons.
 */
export default function ProjectReview({
  board,
  groups,
  items,
  itemLinks,
  profiles = [],
  onOpenItem,
  onGoToGantt,
}: ProjectReviewProps) {
  const { t, dateLocale } = useLanguage();
  const { notes } = useDelayNotes([board.id]);
  const review = useMemo(
    () => buildProjectReview({ board, groups, items, itemLinks, notes }),
    [board, groups, items, itemLinks, notes]
  );

  const day = (d: Date) => format(d, "d MMM yyyy", { locale: dateLocale });
  const days = (n: number) => (Math.abs(n) === 1 ? t("review.dayOne") : t("review.days", { days: Math.abs(n) }));
  const who = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? t("delay.someone");

  if (review.state !== "ready") {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50 dark:bg-slate-950">
        <div className="max-w-md text-center bg-white dark:bg-slate-900 p-8 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
          <Flag className="mx-auto mb-3 text-gray-400" size={28} />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t(review.state === "noDates" ? "review.noDatesTitle" : "review.noBaselineTitle")}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t(review.state === "noDates" ? "review.noDatesBody" : "review.noBaselineBody")}
          </p>
          {review.state === "noBaseline" && (
            <button
              type="button"
              onClick={onGoToGantt}
              className="mt-5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              {t("review.openGantt")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const maxLost = Math.max(1, review.unexplainedTotal, ...review.lostByReason.map((r) => r.days));
  const moved = review.late.filter((task) => task.movedFinish);
  const slipTone =
    review.finishSlip > 0
      ? "text-red-600 dark:text-red-400"
      : review.finishSlip < 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-gray-900 dark:text-gray-100";

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <header>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t("review.title")}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t(review.finished ? "review.subtitleFinished" : "review.subtitleOpen")}
          </p>
        </header>

        {/* ---- the headline numbers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile icon={<CalendarCheck size={15} />} label={t("review.plannedFinish")} value={day(review.plannedFinish!)} />
          <Tile
            icon={<Flag size={15} />}
            label={t(review.finished ? "review.actualFinish" : "review.forecastFinish")}
            value={day(review.finish!)}
          />
          <Tile
            icon={<Timer size={15} />}
            label={t("review.difference")}
            value={
              review.finishSlip === 0
                ? t("review.onTime")
                : review.finishSlip > 0
                  ? t("review.late", { days: days(review.finishSlip) })
                  : t("review.early", { days: days(review.finishSlip) })
            }
            valueClassName={slipTone}
          />
          <Tile
            icon={<TrendingDown size={15} />}
            label={t("review.lateTasks")}
            value={t("review.lateOf", { late: review.late.length, total: review.baselinedCount })}
          />
        </div>

        {review.late.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-700 dark:text-gray-200">{t("review.allOnPlan")}</p>
          </Card>
        ) : (
          <>
            {/* ---- days lost by reason */}
            <Card title={t("review.lostByReason")} subtitle={t("review.lostHint")}>
              <ul className="space-y-2.5" aria-label={t("review.lostByReason")}>
                {review.lostByReason.map((row) => (
                  <ReasonBar
                    key={row.category}
                    label={t(DELAY_CATEGORY_KEYS[row.category])}
                    days={row.days}
                    max={maxLost}
                    valueLabel={days(row.days)}
                  />
                ))}
                {review.unexplainedTotal > 0 && (
                  <ReasonBar
                    label={t("review.notExplained")}
                    days={review.unexplainedTotal}
                    max={maxLost}
                    valueLabel={days(review.unexplainedTotal)}
                    unexplained
                  />
                )}
              </ul>
              {review.unexplainedTotal > 0 && (
                <p className="mt-3 text-[12px] text-gray-500 dark:text-gray-400">{t("review.explainHint")}</p>
              )}
            </Card>

            {/* ---- what actually moved the finish */}
            <Card
              title={t("review.movedTitle")}
              subtitle={t(moved.length ? "review.movedHint" : "review.movedNone")}
            >
              {moved.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {moved.map((task) => (
                    <li key={task.item.id}>
                      <button
                        type="button"
                        onClick={() => onOpenItem(task.item)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-[13px] font-medium hover:bg-red-100 dark:hover:bg-red-900/35"
                      >
                        <Route size={13} />
                        {task.name}
                        <span className="tabular-nums font-semibold">+{task.slip}{t("gantt.dayUnit")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* ---- every late task */}
            <Card title={t("review.lateTitle")} subtitle={t("review.lateHint")}>
              <TaskTable tasks={review.late} onOpenItem={onOpenItem} day={day} />
            </Card>
          </>
        )}

        {/* ---- the lessons, by reason */}
        {review.lessons.length > 0 && (
          <Card title={t("review.lessonsTitle")} icon={<Lightbulb size={15} />}>
            <div className="space-y-4">
              {review.lessons.map((group) => (
                <section key={group.category}>
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                    {t(DELAY_CATEGORY_KEYS[group.category])}
                  </h4>
                  <ul className="space-y-1.5">
                    {group.notes.map(({ note, taskName }) => (
                      <li key={note.id} className="text-[13px] text-gray-800 dark:text-gray-100">
                        <span className="font-semibold">{taskName}</span>
                        <span
                          className={`ml-1.5 tabular-nums font-semibold ${note.days > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
                        >
                          {note.days > 0 ? `+${note.days}` : note.days}
                          {t("gantt.dayUnit")}
                        </span>
                        {note.note && <span className="text-gray-700 dark:text-gray-300"> — {note.note}</span>}
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          {" "}
                          · {who(note.created_by)}, {day(new Date(note.created_at))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>
        )}

        {/* ---- what went better than planned */}
        {review.early.length > 0 && (
          <Card title={t("review.earlyTitle")} subtitle={t("review.earlyHint")}>
            <TaskTable tasks={review.early} onOpenItem={onOpenItem} day={day} />
          </Card>
        )}

        {/* ---- work that was never in the plan */}
        {review.addedAfterPlan.length > 0 && (
          <Card title={t("review.addedTitle")} subtitle={t("review.addedHint")} icon={<Plus size={15} />}>
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {review.addedAfterPlan.map((task) => (
                <li key={task.item.id}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(task.item)}
                    className="w-full flex items-center justify-between gap-3 py-2 text-left text-[13px] hover:bg-gray-50 dark:hover:bg-slate-800/50 rounded px-1"
                  >
                    <span className="text-gray-800 dark:text-gray-100 truncate">{task.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">{day(task.end)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  valueClassName = "text-gray-900 dark:text-gray-100",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${valueClassName}`}>{value}</div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  icon,
  children,
}: {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4 sm:p-5">
      {title && (
        <div className="mb-3">
          <h3 className="flex items-center gap-1.5 text-[15px] font-bold text-gray-900 dark:text-gray-100">
            {icon}
            {title}
          </h3>
          {subtitle && <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * One reason's days as a bar. A single hue throughout - the length is the
 * message; "not explained" is hatched grey so it never reads as a reason.
 */
function ReasonBar({
  label,
  days,
  max,
  valueLabel,
  unexplained = false,
}: {
  label: string;
  days: number;
  max: number;
  valueLabel: string;
  unexplained?: boolean;
}) {
  return (
    // Narrow screens: label and days on one line, the bar full width under
    // them. From sm up: label, bar, days in a row.
    <li
      className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-x-3 gap-y-1"
      title={`${label}: ${valueLabel}`}
    >
      <span
        className={`text-[13px] truncate ${unexplained ? "italic text-gray-500 dark:text-gray-400" : "text-gray-800 dark:text-gray-100"}`}
      >
        {label}
      </span>
      <span className="order-last col-span-2 sm:order-none sm:col-span-1 h-3 rounded-r bg-gray-100 dark:bg-slate-800 overflow-hidden">
        <span
          className="block h-full rounded-r"
          style={{
            width: `${Math.max(2, (days / max) * 100)}%`,
            background: unexplained
              ? "repeating-linear-gradient(135deg, #9ca3af 0 4px, #d1d5db 4px 8px)"
              : BAR,
          }}
        />
      </span>
      <span className="text-[13px] font-semibold tabular-nums text-gray-700 dark:text-gray-200 min-w-[4.5rem] text-right">
        {valueLabel}
      </span>
    </li>
  );
}

function TaskTable({
  tasks,
  onOpenItem,
  day,
}: {
  tasks: ReviewTask[];
  onOpenItem: (item: Item) => void;
  day: (d: Date) => string;
}) {
  const { t } = useLanguage();
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13px] min-w-[560px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
            <th className="font-semibold px-1 pb-2">{t("review.colTask")}</th>
            <th className="font-semibold px-1 pb-2">{t("review.colPlanned")}</th>
            <th className="font-semibold px-1 pb-2">{t("review.colEnd")}</th>
            <th className="font-semibold px-1 pb-2 text-right">{t("review.colDays")}</th>
            <th className="font-semibold px-1 pb-2">{t("review.colReasons")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
          {tasks.map((task) => (
            <tr
              key={task.item.id}
              onClick={() => onOpenItem(task.item)}
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50"
            >
              <td className="px-1 py-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {task.movedFinish && task.slip > 0 && (
                    <Route size={13} className="text-red-500 shrink-0" aria-label={t("review.movedShort")} />
                  )}
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{task.name}</span>
                </div>
                {task.groupTitle && (
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{task.groupTitle}</div>
                )}
              </td>
              <td className="px-1 py-2 tabular-nums text-gray-600 dark:text-gray-300 whitespace-nowrap">{day(task.plannedEnd)}</td>
              <td className="px-1 py-2 tabular-nums text-gray-600 dark:text-gray-300 whitespace-nowrap">{day(task.end)}</td>
              <td
                className={`px-1 py-2 text-right tabular-nums font-semibold ${task.slip > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
              >
                {task.slip > 0 ? `+${task.slip}` : task.slip}
                {t("gantt.dayUnit")}
                {task.inherited > 0 && (
                  <div className="text-[11px] font-normal text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {t("review.inheritedShort", { days: task.inherited })}
                  </div>
                )}
              </td>
              <td className="px-1 py-2">
                <div className="flex flex-wrap gap-1">
                  {task.notes.map((note) => (
                    <span
                      key={note.id}
                      title={note.note ?? undefined}
                      className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[11px] text-gray-700 dark:text-gray-200"
                    >
                      {t(DELAY_CATEGORY_KEYS[note.category])}
                    </span>
                  ))}
                  {task.unexplained !== 0 && (
                    <span className="px-1.5 py-0.5 rounded border border-dashed border-amber-400 text-[11px] text-amber-700 dark:text-amber-300">
                      {t("review.unexplainedChip", { days: Math.abs(task.unexplained) })}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
