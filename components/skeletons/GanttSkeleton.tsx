"use client";

import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export function GanttSkeleton() {
  const bars = [
    { left: "10%", width: "25%", color: "bg-blue-200 dark:bg-blue-900/50" },
    { left: "30%", width: "40%", color: "bg-purple-200 dark:bg-purple-900/50" },
    { left: "15%", width: "20%", color: "bg-emerald-200 dark:bg-emerald-900/50" },
    { left: "50%", width: "35%", color: "bg-amber-200 dark:bg-amber-900/50" },
    { left: "25%", width: "45%", color: "bg-indigo-200 dark:bg-indigo-900/50" },
    { left: "60%", width: "25%", color: "bg-rose-200 dark:bg-rose-900/50" },
  ];

  return (
    <div className="flex-1 flex h-full bg-white dark:bg-slate-900 overflow-hidden select-none">
      {/* Left List Pane Skeleton */}
      <div className="w-72 border-r border-gray-200 dark:border-slate-800 flex flex-col">
        <div className="h-12 border-b border-gray-200 dark:border-slate-800 px-4 flex items-center justify-between bg-gray-50/50 dark:bg-slate-900/50">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex-1 p-3 space-y-4">
          {bars.map((_, idx) => (
            <div key={idx} className="flex items-center justify-between py-1.5">
              <div className="flex items-center space-x-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className={`h-4 ${idx % 2 === 0 ? "w-28" : "w-36"}`} />
              </div>
              <Skeleton className="h-3 w-12 opacity-60" />
            </div>
          ))}
        </div>
      </div>

      {/* Right Timeline Grid Skeleton */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Timeline Months / Days Header */}
        <div className="h-12 border-b border-gray-200 dark:border-slate-800 flex items-center px-6 space-x-12 bg-gray-50/50 dark:bg-slate-900/50">
          {[1, 2, 3, 4, 5, 6].map((m) => (
            <Skeleton key={m} className="h-5 w-24" />
          ))}
        </div>

        {/* Timeline Chart Area */}
        <div className="flex-1 p-3 space-y-4 relative">
          {/* Vertical grid lines */}
          <div className="absolute inset-0 grid grid-cols-6 pointer-events-none opacity-20 dark:opacity-10">
            {[1, 2, 3, 4, 5, 6].map((g) => (
              <div key={g} className="border-r border-gray-300 dark:border-slate-700 h-full" />
            ))}
          </div>

          {/* Timeline Bars */}
          {bars.map((bar, idx) => (
            <div key={idx} className="h-7 flex items-center relative my-1">
              <div
                className={`absolute h-6 rounded-full animate-pulse transition-all ${bar.color}`}
                style={{ left: bar.left, width: bar.width }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GanttSkeleton;
