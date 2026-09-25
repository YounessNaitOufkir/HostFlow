"use client";

import React, { useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import {
  computePortfolio,
  portfolioBoards,
  type AttentionReason,
  type PortfolioAttentionItem,
  type PortfolioCard,
  type PortfolioSpan,
} from "@/lib/dashboard/portfolio";
import { daysBetween, today as todayDate } from "@/lib/gantt/dates";
import type { Board, Profile, Workspace } from "@/types";
import type { TranslationKey } from "@/lib/i18n/types";

interface PortfolioOverviewProps {
  workspaces: Workspace[];
  boards: Board[];
  profiles: Profile[];
  isTeam: boolean;
  onOpenWorkspace: (workspace: Workspace) => void;
  onOpenTask: (boardId: string, itemId: string) => void;
}

const ATTENTION_LIMIT = 8;
const DONE = "#00c875";
const LATE = "#d03b3b";

const REASON_STYLE: Record<AttentionReason, string> = {
  overdue: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  stuck: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  dueSoon: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  noStatus: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300",
  unassigned: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export default function PortfolioOverview({
  workspaces,
  boards,
  profiles,
  isTeam,
  onOpenWorkspace,
  onOpenTask,
}: PortfolioOverviewProps) {
  const { t, bcp47 } = useLanguage();
  const scopedBoards = useMemo(
    () => (isTeam ? portfolioBoards(workspaces, boards) : []),
    [isTeam, workspaces, boards]
  );
  const { items, loading, error, retry } = usePortfolioData(scopedBoards);
  const metrics = useMemo(
    () => computePortfolio(workspaces, scopedBoards, items, profiles),
    [workspaces, scopedBoards, items, profiles]
  );
  const shortDate = useMemo(
    () => new Intl.DateTimeFormat(bcp47, { day: "numeric", month: "short" }),
    [bcp47]
  );

  let body: React.ReactNode;
  if (!isTeam) {
    body = <Notice title={t("portfolio.teamOnlyTitle")} text={t("portfolio.teamOnlyBody")} />;
  } else if (scopedBoards.length === 0) {
    body = <Notice title={t("portfolio.emptyTitle")} text={t("portfolio.emptyBody")} />;
  } else if (error) {
    body = (
      <Notice title={t("portfolio.errorTitle")} text={t("portfolio.errorBody")}>
        <button
          type="button"
          onClick={retry}
          className="mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          {t("portfolio.retry")}
        </button>
      </Notice>
    );
  } else if (loading) {
    body = <Skeleton />;
  } else {
    body = (
      <>
        <section aria-labelledby="portfolio-workspaces">
          <h2 id="portfolio-workspaces" className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            {t("portfolio.workspaces")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {metrics.cards.map((card) => (
              <WorkspaceCard
                key={card.workspace.id}
                card={card}
                t={t}
                shortDate={shortDate}
                onOpen={() => onOpenWorkspace(card.workspace)}
              />
            ))}
          </div>
        </section>

        <AttentionSection
          attention={metrics.attention}
          cards={metrics.cards}
          t={t}
          onOpenTask={onOpenTask}
        />

        {metrics.spans.length > 0 && (
          <TimelineSection
            spans={metrics.spans}
            undated={metrics.undated}
            t={t}
            bcp47={bcp47}
            shortDate={shortDate}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[#F4F6F8] dark:bg-[#181b34] px-4 py-6 sm:p-8">
      <div className="max-w-[1200px] mx-auto space-y-8">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">
            {t("portfolio.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("portfolio.subtitle")}</p>
        </header>
        {body}
      </div>
    </div>
  );
}

function WorkspaceCard({
  card,
  t,
  shortDate,
  onOpen,
}: {
  card: PortfolioCard;
  t: T;
  shortDate: Intl.DateTimeFormat;
  onOpen: () => void;
}) {
  const empty = card.total === 0;
  const pill = empty
    ? { text: t("portfolio.noTasks"), cls: "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-400" }
    : card.attention > 0
      ? {
          text: card.attention === 1
            ? t("portfolio.pillAttentionOne")
            : t("portfolio.pillAttention", { count: card.attention }),
          cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
        }
      : card.open === 0
        ? { text: t("portfolio.pillAllDone"), cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" }
        : { text: t("portfolio.pillOpen", { count: card.open }), cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" };

  const footer = empty
    ? null
    : card.nextDue
      ? t("portfolio.nextDue", { date: shortDate.format(card.nextDue) })
      : card.open === 0 && card.lastEnd
        ? t("portfolio.lastEnded", { date: shortDate.format(card.lastEnd) })
        : !card.lastEnd
          ? t("portfolio.noDates")
          : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("portfolio.openWorkspace", { name: card.workspace.name })}
      className={`text-left bg-white dark:bg-slate-900 rounded-xl p-5 border shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 focus-visible:outline-2 focus-visible:outline-blue-500 transition-all flex flex-col gap-4 ${
        card.attention > 0 ? "border-amber-200 dark:border-amber-900/60" : "border-gray-100 dark:border-slate-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <span className="font-semibold text-gray-800 dark:text-gray-100 truncate" title={card.workspace.name}>
          {card.workspace.name}
        </span>
        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${pill.cls}`}>
          {pill.text}
        </span>
      </div>

      {empty ? (
        <p className="text-[13px] text-gray-400 dark:text-gray-500">{t("portfolio.noTasks")}</p>
      ) : (
        <div className="flex items-center gap-3">
          <Ring pct={card.donePct} />
          <div className="text-[13px] leading-snug min-w-0">
            <div className="font-medium text-gray-800 dark:text-gray-100 tabular-nums">
              {t("portfolio.doneOf", { done: card.done, total: card.total })}
            </div>
            <div className="text-gray-500 dark:text-gray-400 tabular-nums">
              {t("portfolio.overdueStuck", { overdue: card.overdue, stuck: card.stuck })}
            </div>
          </div>
        </div>
      )}

      {footer && (
        <div className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-slate-800 pt-3 w-full">
          {footer}
        </div>
      )}
    </button>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg viewBox="0 0 48 48" className="w-12 h-12 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-gray-100 dark:stroke-slate-800" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={DONE}
          strokeWidth="5"
          strokeLinecap={pct > 0 && pct < 100 ? "round" : "butt"}
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10.5px] font-semibold tabular-nums text-gray-700 dark:text-gray-200">
        {pct}%
      </span>
    </div>
  );
}

function AttentionSection({
  attention,
  cards,
  t,
  onOpenTask,
}: {
  attention: PortfolioAttentionItem[];
  cards: PortfolioCard[];
  t: T;
  onOpenTask: (boardId: string, itemId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? attention : attention.slice(0, ATTENTION_LIMIT);
  const groups = cards
    .map((c) => ({ workspace: c.workspace, rows: visible.filter((r) => r.workspaceId === c.workspace.id) }))
    .filter((g) => g.rows.length > 0);

  const dueLabel = (offset: number | null) => {
    if (offset === null) return t("portfolio.noDue");
    if (offset < -1) return t("dash.daysLate", { days: -offset });
    if (offset === -1) return t("dash.dayLate");
    if (offset === 0) return t("dash.dueToday");
    if (offset === 1) return t("dash.dueTomorrow");
    return t("dash.dueInDays", { days: offset });
  };

  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 dark:border-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{t("portfolio.attention")}</h2>
        <span className="text-[13px] text-gray-500 dark:text-gray-400">{t("portfolio.attentionHint")}</span>
      </div>

      {attention.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4">{t("portfolio.attentionEmpty")}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.workspace.id}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                {g.workspace.name}
              </div>
              <ul>
                {g.rows.map((row) => {
                  const late = row.offsetDays !== null && row.offsetDays <= 0;
                  const owner = row.ownerUnknown
                    ? t("portfolio.unknownPerson")
                    : row.ownerName ?? t("dash.unassigned");
                  return (
                    <li key={row.itemId} className="border-t border-gray-100 dark:border-slate-800 first:border-t-0">
                      <button
                        type="button"
                        onClick={() => onOpenTask(row.boardId, row.itemId)}
                        className="w-full flex items-center gap-3 py-2.5 px-1 -mx-1 text-left rounded-md hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <span className={`shrink-0 w-[5.5rem] text-center text-[11px] font-semibold px-2 py-0.5 rounded ${REASON_STYLE[row.reason]}`}>
                          {t(`portfolio.reason.${row.reason}` as TranslationKey)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{row.name}</span>
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                            {row.boardName} · {owner}
                            {row.extraOwners > 0 ? ` +${row.extraOwners}` : ""}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-right text-[13px] font-semibold tabular-nums ${late ? "" : "text-gray-500 dark:text-gray-400"}`}
                          style={late ? { color: LATE } : undefined}
                        >
                          {dueLabel(row.offsetDays)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {attention.length > ATTENTION_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-[13px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAll ? t("portfolio.showLess") : t("portfolio.showAll", { count: attention.length })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TimelineSection({
  spans,
  undated,
  t,
  bcp47,
  shortDate,
}: {
  spans: PortfolioSpan[];
  undated: Workspace[];
  t: T;
  bcp47: string;
  shortDate: Intl.DateTimeFormat;
}) {
  const axis = useMemo(() => {
    const minStart = spans.reduce((a, s) => (s.start < a ? s.start : a), spans[0].start);
    const maxEnd = spans.reduce((a, s) => (s.end > a ? s.end : a), spans[0].end);
    const from = new Date(minStart.getFullYear(), minStart.getMonth(), 1);
    const to = new Date(maxEnd.getFullYear(), maxEnd.getMonth() + 1, 1);
    const total = Math.max(1, daysBetween(from, to));
    const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
    const step = months <= 12 ? 1 : months <= 24 ? 2 : months <= 48 ? 3 : 12;
    const month = new Intl.DateTimeFormat(bcp47, { month: "short" });
    const monthYear = new Intl.DateTimeFormat(bcp47, { month: "short", year: "numeric" });
    const ticks: { pct: number; label: string }[] = [];
    for (let i = 0; i < months; i += step) {
      const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
      ticks.push({
        pct: (daysBetween(from, d) / total) * 100,
        label: i === 0 || d.getMonth() < step ? monthYear.format(d) : month.format(d),
      });
    }
    return { from, to, total, ticks };
  }, [spans, bcp47]);

  const pos = (d: Date) => (daysBetween(axis.from, d) / axis.total) * 100;
  const now = todayDate();
  const todayPct = now >= axis.from && now < axis.to ? pos(now) : null;
  const hasTail = spans.some((s) => s.end > s.coreEnd);
  const cols = "grid grid-cols-[6.5rem_minmax(0,1fr)_4rem] sm:grid-cols-[9rem_minmax(0,1fr)_6.5rem] gap-3 items-center";

  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 dark:border-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{t("portfolio.timelines")}</h2>
        <span className="text-[13px] text-gray-500 dark:text-gray-400">{t("portfolio.timelinesHint")}</span>
      </div>

      <div className="space-y-2.5">
        {spans.map((s) => {
          const left = pos(s.start);
          const coreWidth = Math.max(0.6, pos(s.coreEnd) - left);
          const tailWidth = s.end > s.coreEnd ? pos(s.end) - pos(s.coreEnd) : 0;
          const range = `${shortDate.format(s.start)} – ${shortDate.format(s.end)}`;
          return (
            <div key={s.workspace.id} className={cols}>
              <span className="truncate text-[13px] font-medium text-gray-700 dark:text-gray-200" title={s.workspace.name}>
                {s.workspace.name}
              </span>
              <div className="relative h-5 rounded bg-gray-50 dark:bg-slate-800/60" title={range}>
                {axis.ticks.map((tick) => (
                  <span key={tick.pct} className="absolute top-0 bottom-0 w-px bg-gray-200/70 dark:bg-slate-700/60" style={{ left: `${tick.pct}%` }} />
                ))}
                <span className="absolute top-[3px] h-[14px] rounded bg-[#579bfc]" style={{ left: `${left}%`, width: `${coreWidth}%` }} />
                {tailWidth > 0 && (
                  <span
                    className="absolute top-[3px] h-[14px] rounded-r bg-[#579bfc]/30"
                    style={{ left: `${left + coreWidth}%`, width: `${tailWidth}%` }}
                  />
                )}
                {todayPct !== null && (
                  <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-orange-500 rounded" style={{ left: `${todayPct}%` }} />
                )}
              </div>
              <span className="text-right leading-tight">
                <span className="block text-[13px] font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                  {t("portfolio.days", { days: s.coreDays })}
                </span>
                {s.end > s.coreEnd && (
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    {t("portfolio.tailNote", { date: shortDate.format(s.end) })}
                  </span>
                )}
              </span>
            </div>
          );
        })}

        <div className={cols}>
          <span />
          <div className="relative h-4 text-[10.5px] text-gray-500 dark:text-gray-400">
            {axis.ticks.map((tick, i) => (
              <span
                key={tick.pct}
                className="absolute whitespace-nowrap"
                style={{ left: `${tick.pct}%`, transform: i === 0 ? "none" : "translateX(-50%)" }}
              >
                {tick.label}
              </span>
            ))}
          </div>
          <span />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        {hasTail && <span>{t("portfolio.coreLegend")}</span>}
        {todayPct !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-0.5 h-3 bg-orange-500 rounded" aria-hidden />
            {t("portfolio.today")}
          </span>
        )}
        {undated.length > 0 && (
          <span>{t("portfolio.undatedNote", { names: undated.map((w) => w.name).join(", ") })}</span>
        )}
      </div>
    </section>
  );
}

function Notice({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-10 sm:p-12 text-center">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{text}</p>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[150px] rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 animate-pulse" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 animate-pulse" />
    </div>
  );
}
