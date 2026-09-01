"use client";

import React from "react";
import type { GanttScale, GanttTick, PxWindow } from "@/lib/gantt/scale";

export const GANTT_HEADER_HEIGHT = 56;

interface GanttHeaderProps {
  scale: GanttScale;
  window: PxWindow;
}

/**
 * The two-tier time axis every real Gantt has: a coarse band naming the period
 * (month, or year at the wider zooms) over a fine band of its units.
 *
 * One band cannot do both jobs. A row of bare day numbers does not say which
 * month you are looking at, and a row of month names does not let you land a
 * bar on the 14th. Cells are positioned from `scale.xOf` in absolute pixels -
 * the same call the bars and the arrows use - so the three layers cannot drift
 * apart the way the old percent-vs-pixel split allowed.
 */
export function GanttHeader({ scale, window }: GanttHeaderProps) {
  const major = scale.majorTicks(window);
  const minor = scale.minorTicks(window);

  return (
    <div
      className="relative bg-white dark:bg-[#131722] select-none"
      style={{ width: scale.width, height: GANTT_HEADER_HEIGHT }}
    >
      <div className="absolute inset-x-0 top-0 h-7">
        {major.map((tick) => (
          <MajorCell key={tick.key} tick={tick} />
        ))}
      </div>

      <div className="absolute inset-x-0 top-7 bottom-0 border-t border-gray-200 dark:border-[#1e2333]">
        {minor.map((tick) => (
          <MinorCell key={tick.key} tick={tick} />
        ))}
      </div>
    </div>
  );
}

function MajorCell({ tick }: { tick: GanttTick }) {
  return (
    <div
      className="absolute top-0 h-7 flex items-center border-r border-gray-200 dark:border-[#1e2333] overflow-hidden"
      style={{ left: tick.x, width: tick.width }}
    >
      {/* Pinned to the left of its own cell so the label survives a band whose
          start is scrolled off, rather than centring itself into nowhere. */}
      <span className="px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 whitespace-nowrap">
        {tick.label}
      </span>
    </div>
  );
}

function MinorCell({ tick }: { tick: GanttTick }) {
  return (
    <div
      className="absolute top-0 bottom-0 flex flex-col items-center justify-center border-r border-gray-200 dark:border-[#1e2333] overflow-hidden"
      style={{ left: tick.x, width: tick.width }}
    >
      {tick.subLabel && (
        <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500 uppercase leading-none">
          {tick.subLabel}
        </span>
      )}
      <span
        className={`text-xs font-semibold leading-none whitespace-nowrap ${
          tick.subLabel ? "mt-1" : ""
        } ${
          tick.isToday
            ? "bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.5)]"
            : "text-gray-700 dark:text-slate-300"
        }`}
      >
        {tick.label}
      </span>
    </div>
  );
}
