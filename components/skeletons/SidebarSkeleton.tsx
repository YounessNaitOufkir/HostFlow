"use client";

import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Was one 264px dark-slate column, shaped like neither piece of the real
 * shell and forced dark regardless of theme — a light-mode visitor got a
 * dark flash before the real light panel appeared underneath it.
 *
 * The real shell is two pieces: a 60px navy icon rail (always navy, in both
 * themes — see Sidebar.tsx) and a separate light/dark workspace panel. This
 * mirrors that shape exactly, including a static rail (nothing in it changes
 * while loading, so there is nothing to skeleton there — just the true navy
 * background and dimmed placeholders for the icons that will appear).
 */
export function SidebarSkeleton() {
  return (
    <div className="flex h-full select-none">
      {/* Icon rail — same navy in both themes as the real one. */}
      <div className="w-[60px] bg-[#1A2C5B] flex flex-col items-center py-4 justify-between shrink-0">
        <div className="flex flex-col items-center space-y-3 w-full">
          <div className="w-9 h-9 rounded-lg bg-white/10" />
          <div className="w-8 border-t border-white/10 my-1" />
          <div className="w-10 h-10 rounded-lg bg-white/5" />
          <div className="w-10 h-10 rounded-lg bg-white/5" />
          <div className="w-10 h-10 rounded-lg bg-white/5" />
        </div>
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 rounded-lg bg-white/5" />
          <div className="w-9 h-9 rounded-full bg-white/10" />
        </div>
      </div>

      {/* Workspace panel */}
      <div className="w-[260px] bg-white dark:bg-[#1e2140] border-r border-gray-200/80 dark:border-slate-700/50 flex flex-col p-4 space-y-6">
        <div className="flex items-center space-x-3 p-2">
          <Skeleton className="h-8 w-8" variant="circular" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg opacity-60" />
        </div>

        <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-slate-700">
          <div className="flex items-center justify-between px-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-4 w-4" />
          </div>

          <div className="space-y-1 pt-1">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className="flex items-center space-x-2.5 px-2 py-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className={idx % 2 === 0 ? "h-4 w-32" : "h-4 w-40"} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SidebarSkeleton;
