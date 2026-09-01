"use client";

import React from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Columns3,
  Flag,
  Maximize2,
  Palette,
  Route,
  ZoomIn,
  ZoomOut,
  Lock,
} from "lucide-react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { GANTT_ZOOMS, ZOOM_LABELS, type GanttZoom } from "@/lib/gantt/scale";
import { GanttExportMenu, type GanttExportKind } from "./GanttExportMenu";
import {
  GANTT_FIELDS,
  GANTT_FIELD_ORDER,
  type GanttFieldKey,
} from "@/lib/gantt/taskFields";

export type GanttColorBy = "group" | "status";

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
  const [showColorMenu, setShowColorMenu] = React.useState(false);
  const [showFieldMenu, setShowFieldMenu] = React.useState(false);
  const [showBaselineMenu, setShowBaselineMenu] = React.useState(false);
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(showColorMenu, {
    align: "right",
    onDismiss: () => setShowColorMenu(false),
  });
  const {
    anchorRef: fieldAnchorRef,
    menuRef: fieldMenuRef,
    menuStyle: fieldMenuStyle,
  } = useAnchoredMenu(showFieldMenu, {
    align: "right",
    onDismiss: () => setShowFieldMenu(false),
  });
  const {
    anchorRef: baselineAnchorRef,
    menuRef: baselineMenuRef,
    menuStyle: baselineMenuStyle,
  } = useAnchoredMenu(showBaselineMenu, {
    align: "right",
    onDismiss: () => setShowBaselineMenu(false),
  });

  const toggleField = (key: GanttFieldKey) => {
    onFieldsChange(
      fields.includes(key) ? fields.filter((f) => f !== key) : [...fields, key]
    );
  };

  const zoomIndex = GANTT_ZOOMS.indexOf(zoom);
  const stepZoom = (delta: number) => {
    const next = GANTT_ZOOMS[zoomIndex + delta];
    if (next) onZoomChange(next);
  };

  return (
    <div className="flex items-center gap-2 px-6 pt-4 pb-3 z-[100] relative">
      {children}

      {/* A broken link used to look exactly like a working one - the arrow simply
          pointed backwards. Saying how many are broken makes it findable. */}
      {violationCount > 0 && (
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium"
          title="These tasks start before the task they depend on has finished."
        >
          <AlertTriangle size={12} />
          {violationCount} broken {violationCount === 1 ? "link" : "links"}
        </span>
      )}

      {cycleCount > 0 && (
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium"
          title="These tasks depend on each other in a loop, so the plan has no order and no critical path."
        >
          <AlertTriangle size={12} />
          {cycleCount} in a dependency loop
        </span>
      )}

      {readOnlyReason && (
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium"
          title={readOnlyReason}
        >
          <Lock size={12} />
          Read-only
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onScrollToToday}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
          title="Scroll to today"
        >
          <CalendarClock size={14} className="text-gray-500 dark:text-gray-400" />
          Today
        </button>

        <button
          type="button"
          onClick={() => onShowCriticalPathChange(!showCriticalPath)}
          aria-pressed={showCriticalPath}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md shadow-sm transition-colors text-sm font-medium ${
            showCriticalPath
              ? "bg-red-50 dark:bg-red-900/25 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
              : "bg-white dark:bg-[#1e2333] border-gray-200 dark:border-[#2d3555] hover:bg-gray-50 dark:hover:bg-[#252a3f] text-gray-700 dark:text-gray-200"
          }`}
          title="Highlight the chain of tasks with no slack — the one that sets the finish date"
        >
          <Route size={14} className={showCriticalPath ? "" : "text-gray-500 dark:text-gray-400"} />
          Critical path
          {showCriticalPath && criticalCount > 0 && (
            <span className="tabular-nums opacity-70">{criticalCount}</span>
          )}
        </button>

        {/* A chart of only the current plan always looks on time: the slippage
            is exactly what has been edited away.

            A menu rather than a plain button because there are two separate
            actions here, and the first version conflated them: once a baseline
            existed the button became a show/hide toggle, which left no way to
            re-capture one at all. */}
        {(baselineCount > 0 || onCaptureBaseline) && (
          <div className="relative" ref={baselineAnchorRef}>
            <button
              type="button"
              onClick={() => setShowBaselineMenu((v) => !v)}
              aria-expanded={showBaselineMenu}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md shadow-sm transition-colors text-sm font-medium ${
                showBaseline && baselineCount > 0
                  ? "bg-slate-100 dark:bg-slate-700/40 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                  : "bg-white dark:bg-[#1e2333] border-gray-200 dark:border-[#2d3555] hover:bg-gray-50 dark:hover:bg-[#252a3f] text-gray-700 dark:text-gray-200"
              }`}
              title="The plan as it was agreed, and how far today's dates have drifted from it"
            >
              <Flag
                size={14}
                className={showBaseline && baselineCount > 0 ? "" : "text-gray-500 dark:text-gray-400"}
              />
              Baseline
            </button>

            {showBaselineMenu && (
              <div
                ref={baselineMenuRef}
                style={baselineMenuStyle}
                className="w-64 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-lg z-[60] overflow-hidden p-1.5"
              >
                <button
                  type="button"
                  disabled={baselineCount === 0}
                  onClick={() => {
                    onShowBaselineChange(!showBaseline);
                    setShowBaselineMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      showBaseline && baselineCount > 0
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "border-gray-300 dark:border-slate-600"
                    }`}
                  >
                    {showBaseline && baselineCount > 0 && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Show the agreed plan
                    </span>
                    <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                      {baselineCount > 0
                        ? `${baselineCount} task${baselineCount === 1 ? "" : "s"} have one`
                        : "Nothing captured yet"}
                    </span>
                  </span>
                </button>

                {onCaptureBaseline && (
                  <button
                    type="button"
                    onClick={() => {
                      onCaptureBaseline();
                      setShowBaselineMenu(false);
                    }}
                    className="w-full flex items-start gap-2.5 px-2.5 py-2 mt-0.5 rounded-md text-left hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors"
                  >
                    <Flag size={14} className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        {baselineCount > 0 ? "Update baseline" : "Set baseline"}
                      </span>
                      <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                        {baselineCount > 0
                          ? "Replaces it with today's dates"
                          : "Freeze today's dates as the agreed plan"}
                      </span>
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onFitToWindow}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
          title="Fit the whole plan in the window"
        >
          <Maximize2 size={14} className="text-gray-500 dark:text-gray-400" />
          Fit
        </button>

        {/* Zoom: a stepper for quick moves, with every scale named so the
            current one is readable rather than inferred from column width. */}
        <div
          className="flex items-center bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-sm overflow-hidden"
          role="group"
          aria-label="Timeline scale"
        >
          <button
            type="button"
            onClick={() => stepZoom(-1)}
            disabled={zoomIndex === 0}
            className="px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={14} className="text-gray-500 dark:text-gray-400" />
          </button>
          {GANTT_ZOOMS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onZoomChange(option)}
              aria-pressed={zoom === option}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 dark:border-[#2d3555] ${
                zoom === option
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#252a3f]"
              }`}
            >
              {ZOOM_LABELS[option]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => stepZoom(1)}
            disabled={zoomIndex === GANTT_ZOOMS.length - 1}
            className="px-2 py-1.5 border-l border-gray-200 dark:border-[#2d3555] hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={14} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* The numbers people argue about - duration, slack, what a task is
            waiting on - are read from the table, not measured off the bars. */}
        <div className="relative" ref={fieldAnchorRef}>
          <button
            type="button"
            onClick={() => setShowFieldMenu((v) => !v)}
            aria-expanded={showFieldMenu}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
            title="Choose the fields shown in the task table beside the chart"
          >
            <Columns3 size={14} className="text-gray-500 dark:text-gray-400" />
            Fields
          </button>
          {showFieldMenu && (
            <div
              ref={fieldMenuRef}
              style={fieldMenuStyle}
              className="w-56 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-lg z-[60] overflow-hidden p-1.5"
            >
              {GANTT_FIELD_ORDER.map((key) => {
                const active = fields.includes(key);
                // The name is what identifies the row; without it the table is
                // a grid of dates belonging to nothing.
                const locked = key === "name";
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => !locked && toggleField(key)}
                    disabled={locked}
                    aria-pressed={active}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-sm transition-colors ${
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
                    {GANTT_FIELDS[key].label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <GanttExportMenu onExport={onExport} />

        <div className="relative" ref={anchorRef}>
          <button
            type="button"
            onClick={() => setShowColorMenu((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            <Palette size={14} className="text-gray-500 dark:text-gray-400" />
            Color by
          </button>
          {showColorMenu && (
            <div
              ref={menuRef}
              style={menuStyle}
              className="w-48 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-lg z-[60] overflow-hidden"
            >
              <div className="p-2">
                {(["group", "status"] as GanttColorBy[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      onColorByChange(option);
                      setShowColorMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors capitalize ${
                      colorBy === option
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold"
                        : "hover:bg-gray-50 dark:hover:bg-[#252a3f] text-gray-700 dark:text-gray-300"
                    } ${option === "status" ? "mt-1" : ""}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
