"use client";

import React from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Check,
  Flag,
  Maximize2,
  Palette,
  Route,
  SlidersHorizontal,
  Lock,
} from "lucide-react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { useT } from "@/components/LanguageProvider";
import { GANTT_ZOOMS, ZOOM_LABEL_KEYS, type GanttZoom } from "@/lib/gantt/scale";
import { GanttExportMenu, type GanttExportKind } from "./GanttExportMenu";
import {
  GANTT_FIELDS,
  GANTT_FIELD_ORDER,
  type GanttFieldKey,
} from "@/lib/gantt/taskFields";

export type GanttColorBy = "group" | "status";

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
  zoom: GanttZoom;
  onZoomChange: (zoom: GanttZoom) => void;
  colorBy: GanttColorBy;
  onColorByChange: (value: GanttColorBy) => void;
  onScrollToToday: () => void;
  onFitToWindow: () => void;
  showCriticalPath: boolean;
  onShowCriticalPathChange: (value: boolean) => void;
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
  onExport: (kind: GanttExportKind) => Promise<void> | void;
  fields: GanttFieldKey[];
  onFieldsChange: (fields: GanttFieldKey[]) => void;
  /** Set when the chart cannot be edited, so the reason is stated rather than left to be discovered. */
  readOnlyReason?: string;
  children?: React.ReactNode;
}

export function GanttToolbar({
  zoom,
  onZoomChange,
  colorBy,
  onColorByChange,
  onScrollToToday,
  onFitToWindow,
  showCriticalPath,
  onShowCriticalPathChange,
  criticalCount,
  violationCount,
  cycleCount,
  onGoToViolation,
  showBaseline,
  onShowBaselineChange,
  baselineCount,
  onCaptureBaseline,
  onExport,
  fields,
  onFieldsChange,
  readOnlyReason,
  children,
}: GanttToolbarProps) {
  const t = useT();
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
        className={`${ganttToolbarButton()} px-2`}
        title={t("gantt.fitHint")}
        aria-label={t("gantt.fit")}
      >
        <Maximize2 size={16} className="text-gray-500 dark:text-gray-400" />
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

            {(["group", "status"] as GanttColorBy[]).map((option) => (
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
                {t(option === "group" ? "gantt.colorBy.group" : "gantt.colorBy.status")}
                {colorBy === option && <Check size={13} strokeWidth={3} />}
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
