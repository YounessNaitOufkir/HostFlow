"use client";

import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export function ItemPanelSkeleton() {
  return (
    <div className="p-6 space-y-6 select-none">
      {[1, 2, 3].map((idx) => (
        <div
          key={idx}
          className="p-4 bg-gray-50/80 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-slate-700/60 space-y-3"
        >
          {/* Author header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <Skeleton className="h-8 w-8" variant="circular" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16 opacity-60" />
              </div>
            </div>
            <Skeleton className="h-4 w-12 opacity-60" />
          </div>

          {/* Body text */}
          <div className="space-y-2 pl-10">
            <Skeleton className="h-4 w-full" />
            <Skeleton className={`h-4 ${idx % 2 === 0 ? "w-4/5" : "w-3/5"}`} />
          </div>

          {/* Footer actions */}
          <div className="flex items-center space-x-4 pl-10 pt-1">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default ItemPanelSkeleton;
