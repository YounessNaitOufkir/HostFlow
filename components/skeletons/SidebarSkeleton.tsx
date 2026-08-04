"use client";

import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export function SidebarSkeleton() {
  return (
    <div className="w-64 h-full bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4 space-y-6 select-none">
      <div className="space-y-6">
        {/* Workspace Switcher Header */}
        <div className="flex items-center space-x-3 p-2 bg-slate-800/60 rounded-lg">
          <Skeleton className="h-8 w-8 !bg-slate-700" variant="circular" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-28 !bg-slate-700" />
            <Skeleton className="h-3 w-16 !bg-slate-700/60" />
          </div>
        </div>

        {/* Primary Nav */}
        <div className="space-y-1.5">
          <Skeleton className="h-9 w-full !bg-slate-800/80 rounded-lg" />
          <Skeleton className="h-9 w-full !bg-slate-800/40 rounded-lg" />
          <Skeleton className="h-9 w-full !bg-slate-800/40 rounded-lg" />
        </div>

        {/* Boards List Section */}
        <div className="space-y-2 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between px-2">
            <Skeleton className="h-3.5 w-16 !bg-slate-700/60" />
            <Skeleton className="h-4 w-4 !bg-slate-700/60" />
          </div>

          <div className="space-y-1 pt-1">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className="flex items-center space-x-2.5 px-2 py-2">
                <Skeleton className="h-4 w-4 !bg-slate-700" />
                <Skeleton className={`h-4 !bg-slate-700 ${idx % 2 === 0 ? "w-32" : "w-40"}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer / Profile section */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <Skeleton className="h-8 w-8 !bg-slate-700" variant="circular" />
          <Skeleton className="h-4 w-24 !bg-slate-700" />
        </div>
        <Skeleton className="h-6 w-6 !bg-slate-700" />
      </div>
    </div>
  );
}

export default SidebarSkeleton;
