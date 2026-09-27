"use client";

import React from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Check,
  Flag,
  Goal,
  Maximize2,
  Palette,
  Rows3,
  Route,
  SlidersHorizontal,
  Lock,
} from "lucide-react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { useLanguage } from "@/components/LanguageProvider";
import { format } from "date-fns";
import DatePopover from "@/components/ui/DatePopover";
import { parseDateOnly } from "@/lib/gantt/dates";
import { GANTT_ZOOMS, ZOOM_LABEL_KEYS, type GanttZoom } from "@/lib/gantt/scale";
import { GanttExportMenu, type GanttExportKind } from "./GanttExportMenu";
import {
  GANTT_FIELDS,
  GANTT_FIELD_ORDER,
  type GanttFieldKey,
} from "@/lib/gantt/taskFields";
import { GANTT_ROW_SIZES, type GanttRowSize } from "@/lib/gantt/rows";
import {
  CRITICAL_PATH_SCOPES,
  CRITICAL_THRESHOLDS,
  type CriticalPathScope,
} from "@/lib/gantt/schedule";

export type GanttColorBy = "group" | "status" | "assignee";
const COLOR_BY_OPTIONS: GanttColorBy[] = ["group", "status", "assignee"];
const COLOR_BY_LABELS = {
  group: "gantt.colorBy.group",
  status: "gantt.colorBy.status",
  assignee: "gantt.colorBy.assignee",
} as const;

/** With the critical path on: fade everything else, or show nothing else. */
export type CriticalDisplay = "highlight" | "only";
export const CRITICAL_DISPLAYS: CriticalDisplay[] = ["highlight", "only"];

/**
 * One button style for the toolbar and for anything a caller puts into it.
 *
 * Exported because the Master Gantt injects its own controls through
 * toolbarExtras; without a shared style those sat beside these as differently
 * shaped objects, which is half of why the row read as noise.
 *
 * Ghost rather than a bordered pill: eleven white cards on a white page gave
 * every control the same weight and drew eleven rectangles the reader had to
 * parse before finding the one they wanted.
 */
export function ganttToolbarButton(active = false): string {
  return [
    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium",
    "transition-colors whitespace-nowrap",
    active
      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
      : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#252a3f]",
  ].join(" ");
}

interface GanttToolbarProps {
  /** Null while fitted: the zoom is then the chart's choice, not the reader's. */
  zoom: GanttZoom | null;
  /** The whole plan is being kept in the window. */
  fitted?: boolean;
  onZoomChange: (zoom: GanttZoom) => void;
  colorBy: GanttColorBy;
  onColorByChange: (value: GanttColorBy) => void;
  onScrollToToday: () => void;
  onFitToWindow: () => void;
  showCriticalPath: boolean;
  onShowCriticalPathChange: (value: boolean) => void;
  criticalScope: CriticalPathScope;
  onCriticalScopeChange: (scope: CriticalPathScope) => void;
  criticalDisplay: CriticalDisplay;
  onCriticalDisplayChange: (display: CriticalDisplay) => void;
  /** Slack, in days, at or below which a task counts as critical. */
  criticalThreshold: number;
  onCriticalThresholdChange: (days: number) => void;
  criticalCount: number;
  violationCount: number;
  cycleCount: number;
  /** Jumps to the next broken link. Absent, the count is just a report. */
  onGoToViolation?: () => void;
  showBaseline: boolean;
  onShowBaselineChange: (value: boolean) => void;
  /** How many tasks already have a captured plan. Zero means there is nothing to show. */
  baselineCount: number;
  onCaptureBaseline?: () => void;
  /**
   * A board with dated tasks and no baseline: nothing to measure a delay
   * against, so nothing to learn from. Offered on the toolbar until set.
   */
  suggestBaseline?: boolean;
  onExport: (kind: GanttExportKind) => Promise<void> | void;
  fields: GanttFieldKey[];
  onFieldsChange: (fields: GanttFieldKey[]) => void;
  rowSize: GanttRowSize;
  onRowSizeChange: (size: GanttRowSize) => void;
  /**
   * A single board's target finish. Absent on the Master Gantt, where each
   * board keeps its own; `onChange` absent means shown but not editable.
   */
  target?: { value: string | null; onChange?: (date: string | null) => void };
  /** How far past target: `days` on a board, `boards` on the Master Gantt. */
  targetMissed?: { days?: number; boards?: number };
  /** Set when the chart cannot be edited, so the reason is stated rather than left to be discovered. */
  readOnlyReason?: string;
  children?: React.ReactNode;
}

export function GanttToolbar({
  zoom,
  fitted = false,
  onZoomChange,
  colorBy,
  onColorByChange,
  onScrollToToday,
  onFitToWindow,
  showCriticalPath,
  onShowCriticalPathChange,
  criticalScope,
  onCriticalScopeChange,
  criticalDisplay,
  onCriticalDisplayChange,
  criticalThreshold,
  onCriticalThresholdChange,
  criticalCount,
  violationCount,
  cycleCount,
  onGoToViolation,
  showBaseline,
  onShowBaselineChange,
  baselineCount,
  onCaptureBaseline,
  suggestBaseline = false,
  onExport,
  fields,
  onFieldsChange,
  rowSize,
  onRowSizeChange,
  readOnlyReason,
  target,
  targetMissed,
  children,
}: GanttToolbarProps) {
  const { t, dateLocale } = useLanguage();
  const targetDate = parseDateOnly(target?.value ?? null);
  const [showViewMenu, setShowViewMenu] = React.useState(false);
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(showViewMenu, {
    align: "right",
    onDismiss: () => setShowViewMenu(false),
  });

  const toggleField = (key: GanttFieldKey) => {
    onFieldsChange(
      fields.includes(key) ? fields.filter((f) => f !== key) : [...fields, key]
    );
  };

  // Anything that changed how the chart looks is worth surfacing on the closed
  // button, so a reader knows the view is modified without opening the menu.
  const viewActive = showCriticalPath || showBaseline;

  return (
    <div className="flex flex-wrap items-center gap-y-1 gap-x-1 px-6 pt-3.5 pb-3 z-40 relative">
      {/* What you are looking at. Allowed to compress and clip, because the
          controls on the right must never be pushed off the edge - which is
          what happened when one flat row shared the width equally. */}
      <div className="flex items-center gap-1 min-w-0">
        {children}

      {/* A broken link looks exactly like a working one - the arrow simply
          points backwards - so the count is how you learn they exist. Pressing
          it walks them: the number alone was a dead end. */}
      {violationCount > 0 && (
        <button
          type="button"
          onClick={onGoToViolation}
          disabled={!onGoToViolation}
          className="flex items-center gap-1.5 px-2.5 py-1 ml-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-semibold enabled:hover:bg-red-100 dark:enabled:hover:bg-red-900/35 transition-colors disabled:cursor-default"
          title={t(onGoToViolation ? "gantt.brokenLinksGoHint" : "gantt.brokenLinksHint")}
        >
          <AlertTriangle size={12} />
          {violationCount === 1
            ? t("gantt.brokenLink", { count: violationCount })
            : t("gantt.brokenLinks", { count: violationCount })}
        </button>
      )}

      {cycleCount > 0 && (
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 ml-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-semibold"
          title={t("gantt.inLoopHint")}
        >
          <AlertTriangle size={12} />
          {t("gantt.inLoop", { count: cycleCount })}
        </span>
      )}

      {/* The forecast finish is past the target: the one number a plan with a
          deadline is judged on, so it is said on the closed toolbar. */}
      {targetMissed && (targetMissed.days || targetMissed.boards) ? (
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 ml-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-semibold"
          title={t("gantt.targetMissedHint")}
        >
          <Goal size={12} />
          {targetMissed.days
            ? t("gantt.targetMissedBy", { days: targetMissed.days })
            : targetMissed.boards === 1
              ? t("gantt.targetMissedBoard")
              : t("gantt.targetMissedBoards", { count: targetMissed.boards ?? 0 })}
        </span>
      ) : null}

      {suggestBaseline && onCaptureBaseline && (
        <button
          type="button"
          onClick={onCaptureBaseline}
          title={t("gantt.noBaselineHint")}
          className="flex items-center gap-1.5 px-2.5 py-1 ml-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/35 transition-colors"
        >
          <Flag size={12} />
          {t("gantt.noBaseline")}
          <span className="font-bold underline underline-offset-2">{t("gantt.baselineSet")}</span>
        </button>
      )}

      {readOnlyReason && (
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 ml-1 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-xs font-medium"
          title={readOnlyReason}
        >
          <Lock size={12} />
          {t("gantt.readOnly")}
        </span>
      )}

      </div>

      {/* The air that makes this readable: scope on the left, controls on the
          right, nothing competing across the gap. */}
      <span className="flex-1 min-w-4" />

      <div className="flex items-center gap-1 shrink-0">
      {target && (target.onChange ? (
        <DatePopover
          mode="single"
          value={{ start: target.value, end: null }}
          onCommit={(next) => {
            if (next.start !== target.value) target.onChange!(next.start);
          }}
          align="right"
          ariaLabel={t("gantt.targetHint")}
          className={ganttToolbarButton(!!targetDate)}
        >
          <Goal size={15} className={targetDate ? "" : "text-gray-500 dark:text-gray-400"} />
          {targetDate
            ? t("gantt.targetOn", { date: format(targetDate, "d MMM", { locale: dateLocale }) })
            : t("gantt.targetSet")}
        </DatePopover>
      ) : targetDate ? (
        <span className={ganttToolbarButton()} title={t("gantt.targetHint")}>
          <Goal size={15} className="text-gray-500 dark:text-gray-400" />
          {t("gantt.targetOn", { date: format(targetDate, "d MMM", { locale: dateLocale }) })}
        </span>
      ) : null)}

      <button
        type="button"
        onClick={onScrollToToday}
        className={ganttToolbarButton()}
        title={t("gantt.todayHint")}
      >
        <CalendarClock size={15} className="text-gray-500 dark:text-gray-400" />
        {t("gantt.today")}
      </button>

      {/* The scale, as a segmented track. The zoom-in / zoom-out steppers that
          used to flank it stepped through these same four values, so they were
          a second control for the thing already named here. */}
      <div
        className="flex items-center gap-0.5 p-0.5 mx-1 rounded-lg bg-gray-100 dark:bg-[#252a3f]"
        role="group"
        aria-label={t("gantt.timelineScale")}
      >
        {GANTT_ZOOMS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onZoomChange(option)}
            aria-pressed={zoom === option}
            className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
              zoom === option
                ? "bg-white dark:bg-[#333a55] text-gray-800 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {t(ZOOM_LABEL_KEYS[option])}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onFitToWindow}
        aria-pressed={fitted}
        className={`${ganttToolbarButton(fitted)} px-2`}
        title={t("gantt.fitHint")}
        aria-label={t("gantt.fit")}
      >
        <Maximize2 size={16} className={fitted ? "" : "text-gray-500 dark:text-gray-400"} />
      </button>

      {/* Everything that answers "how should this chart look" lives here, so
          the row carries what you press constantly and nothing else. */}
      <div className="relative" ref={anchorRef}>
        <button
          type="button"
          onClick={() => setShowViewMenu((v) => !v)}
          aria-expanded={showViewMenu}
          className={ganttToolbarButton(viewActive)}
          title={t("gantt.viewHint")}
        >
          <SlidersHorizontal
            size={15}
            className={viewActive ? "" : "text-gray-500 dark:text-gray-400"}
          />
          {t("gantt.view")}
          <ChevronDown size={13} className="opacity-60" />
        </button>

        {showViewMenu && (
          <div
            ref={menuRef}
            style={menuStyle}
            className="w-72 max-h-[70vh] overflow-y-auto bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-lg shadow-xl z-[60] p-1.5"
          >
            <MenuHeading>{t("gantt.viewShowOnChart")}</MenuHeading>

            <SwitchRow
              icon={<Route size={15} />}
              label={t("gantt.criticalPath")}
              detail={showCriticalPath && criticalCount > 0 ? String(criticalCount) : undefined}
              checked={showCriticalPath}
              onChange={() => onShowCriticalPathChange(!showCriticalPath)}
              title={t("gantt.criticalPathHint")}
            />

            {/* What the path is measured against. Only offered while the path
                is on: with it off, the choice changes nothing you can see. */}
            {showCriticalPath && (
              <div
                className="flex items-center gap-0.5 p-0.5 mx-2.5 mb-1.5 rounded-lg bg-gray-100 dark:bg-[#252a3f]"
                role="group"
                aria-label={t("gantt.criticalPath")}
              >
                {CRITICAL_PATH_SCOPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onCriticalScopeChange(option)}
                    aria-pressed={criticalScope === option}
                    title={t(option === "project" ? "gantt.cpScope.projectHint" : "gantt.cpScope.chainHint")}
                    className={`flex-1 px-2 py-1 rounded-md text-[12px] font-medium transition-colors ${
                      criticalScope === option
                        ? "bg-white dark:bg-[#333a55] text-gray-800 dark:text-gray-100 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {t(option === "project" ? "gantt.cpScope.project" : "gantt.cpScope.chain")}
                  </button>
                ))}
              </div>
            )}

            {showCriticalPath && (
              <div
                className="flex items-center gap-0.5 p-0.5 mx-2.5 mb-1.5 rounded-lg bg-gray-100 dark:bg-[#252a3f]"
                role="group"
                aria-label={t("gantt.cpDisplay")}
              >
                {CRITICAL_DISPLAYS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onCriticalDisplayChange(option)}
                    aria-pressed={criticalDisplay === option}
                    title={t(option === "highlight" ? "gantt.cpDisplay.highlightHint" : "gantt.cpDisplay.onlyHint")}
                    className={`flex-1 px-2 py-1 rounded-md text-[12px] font-medium transition-colors ${
                      criticalDisplay === option
                        ? "bg-white dark:bg-[#333a55] text-gray-800 dark:text-gray-100 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {t(option === "highlight" ? "gantt.cpDisplay.highlight" : "gantt.cpDisplay.only")}
                  </button>
                ))}
              </div>
            )}

            {/* Near-critical: a chain a day or two from setting the finish is
                one bad day from being the path, and worth seeing before then. */}
            {showCriticalPath && (
              <div className="px-2.5 pb-1.5" title={t("gantt.cpThresholdHint")}>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                  {t("gantt.cpThreshold")}
                </div>
                <div
                  className="flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-100 dark:bg-[#252a3f]"
                  role="group"
                  aria-label={t("gantt.cpThreshold")}
                >
                  {CRITICAL_THRESHOLDS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => onCriticalThresholdChange(days)}
                      aria-pressed={criticalThreshold === days}
                      aria-label={t("gantt.cpThresholdDays", { days })}
                      className={`flex-1 px-1 py-1 rounded-md text-[12px] font-medium tabular-nums transition-colors ${
                        criticalThreshold === days
                          ? "bg-white dark:bg-[#333a55] text-gray-800 dark:text-gray-100 shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      {days === 0 ? "0" : `${days}${t("gantt.dayUnit")}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Hidden outright when there is nothing captured and no way to
                capture: a permanently dead switch is worse than an absent one. */}
            {(baselineCount > 0 || onCaptureBaseline) && (
            <SwitchRow
              icon={<Flag size={15} />}
              label={t("gantt.baseline")}
              detail={
                baselineCount === 0
                  ? t("gantt.baselineNone")
                  : baselineCount === 1
                    ? t("gantt.baselineHasOne")
                    : t("gantt.baselineHas", { count: baselineCount })
              }
              checked={showBaseline}
              // Nothing captured means there is nothing to draw, so the switch
              // would silently do nothing.
              disabled={baselineCount === 0}
              onChange={() => onShowBaselineChange(!showBaseline)}
              title={t("gantt.baselineHint")}
            />
            )}

            {onCaptureBaseline && (
              <button
                type="button"
                onClick={() => {
                  onCaptureBaseline();
                  setShowViewMenu(false);
                }}
                title={t(baselineCount === 0 ? "gantt.baselineSetHint" : "gantt.baselineUpdateHint")}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-[13px] text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                {t(baselineCount === 0 ? "gantt.baselineSet" : "gantt.baselineUpdate")}
              </button>
            )}

            <Divider />
            <MenuHeading>{t("gantt.fields")}</MenuHeading>

            {GANTT_FIELD_ORDER.map((key) => {
              const active = fields.includes(key);
              // The name is what identifies the row; without it the table is a
              // grid of dates belonging to nothing.
              const locked = key === "name";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => !locked && toggleField(key)}
                  disabled={locked}
                  aria-pressed={active}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-[13px] transition-colors ${
                    locked
                      ? "text-gray-400 dark:text-gray-600 cursor-default"
                      : "hover:bg-gray-50 dark:hover:bg-[#252a3f] text-gray-700 dark:text-gray-200"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      active
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "border-gray-300 dark:border-slate-600"
                    }`}
                  >
                    {active && <Check size={11} strokeWidth={3} />}
                  </span>
                  {t(GANTT_FIELDS[key].labelKey)}
                </button>
              );
            })}

            <Divider />
            <MenuHeading>
              <span className="flex items-center gap-1.5">
                <Palette size={12} />
                {t("gantt.colorBy")}
              </span>
            </MenuHeading>

            {COLOR_BY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onColorByChange(option)}
                aria-pressed={colorBy === option}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-[13px] transition-colors ${
                  colorBy === option
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-semibold"
                    : "hover:bg-gray-50 dark:hover:bg-[#252a3f] text-gray-700 dark:text-gray-300"
                }`}
              >
                {t(COLOR_BY_LABELS[option])}
                {colorBy === option && <Check size={13} strokeWidth={3} />}
              </button>
            ))}

            <Divider />
            <MenuHeading>
              <span className="flex items-center gap-1.5">
                <Rows3 size={12} />
                {t("gantt.rowSize")}
              </span>
            </MenuHeading>

            {GANTT_ROW_SIZES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onRowSizeChange(option)}
                aria-pressed={rowSize === option}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-[13px] transition-colors ${
                  rowSize === option
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-semibold"
                    : "hover:bg-gray-50 dark:hover:bg-[#252a3f] text-gray-700 dark:text-gray-300"
                }`}
              >
                {t(`gantt.rowSize.${option}`)}
                {rowSize === option && <Check size={13} strokeWidth={3} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <GanttExportMenu onExport={onExport} />
      </div>
    </div>
  );
}

function MenuHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-gray-100 dark:bg-[#2d3555] mx-2 my-1.5" />;
}

function SwitchRow({
  icon,
  label,
  detail,
  checked,
  disabled,
  onChange,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      title={title}
      className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-md transition-colors ${
        disabled
          ? "cursor-default opacity-55"
          : "hover:bg-gray-50 dark:hover:bg-[#252a3f]"
      }`}
    >
      <span className="flex items-center gap-2.5 min-w-0 text-[13px] text-gray-700 dark:text-gray-200">
        <span className={checked ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
        {detail && (
          <span className="text-[12px] text-gray-400 dark:text-gray-500 shrink-0">{detail}</span>
        )}
      </span>
      <span
        className={`w-8 h-[18px] rounded-full relative shrink-0 transition-colors ${
          checked ? "bg-blue-500" : "bg-gray-300 dark:bg-slate-600"
        }`}
      >
        <span
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
