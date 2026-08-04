"use client";

import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export function BoardSkeleton() {
  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden select-none">
      {/* Top Header / View Bar Skeleton */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-6 w-6" variant="circular" />
          </div>
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-8" variant="circular" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Skeleton className="h-8 w-20 rounded-t-md" />
          <Skeleton className="h-8 w-24 rounded-t-md opacity-60" />
          <Skeleton className="h-8 w-20 rounded-t-md opacity-60" />
          <Skeleton className="h-8 w-24 rounded-t-md opacity-60" />
        </div>
      </div>

      {/* Toolbar Skeleton */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-900/50">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-52 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <div className="flex items-center space-x-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* Table Content Skeleton */}
      <div className="flex-1 p-6 overflow-hidden space-y-8">
        {/* Group 1 Skeleton */}
        <div className="space-y-2">
          {/* Group Header */}
          <div className="flex items-center space-x-2 py-1">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-6 w-36 rounded-md" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>

          {/* Table Header Row */}
          <div className="grid grid-cols-12 gap-3 py-2 px-3 bg-gray-100/70 dark:bg-slate-800/70 rounded-md border border-gray-200 dark:border-slate-700/60">
            <div className="col-span-5 flex items-center space-x-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="col-span-2 flex items-center justify-center">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="col-span-2 flex items-center justify-center">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="col-span-3 flex items-center justify-center">
              <Skeleton className="h-4 w-20" />
            </div>
          </div>

          {/* Item Rows Skeleton */}
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-3 py-2.5 px-3 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 items-center"
            >
              <div className="col-span-5 flex items-center space-x-3">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className={`h-4 ${idx % 2 === 0 ? "w-48" : "w-60"}`} />
              </div>
              <div className="col-span-2 flex items-center justify-center">
                <Skeleton className="h-6 w-6" variant="circular" />
              </div>
              <div className="col-span-2 flex items-center justify-center">
                <Skeleton className="h-7 w-24 rounded-full" />
              </div>
              <div className="col-span-3 flex items-center justify-center">
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>

        {/* Group 2 Skeleton */}
        <div className="space-y-2 opacity-60">
          <div className="flex items-center space-x-2 py-1">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-6 w-28 rounded-md" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          {[1, 2].map((idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-3 py-2.5 px-3 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 items-center"
            >
              <div className="col-span-5 flex items-center space-x-3">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="col-span-2 flex items-center justify-center">
                <Skeleton className="h-6 w-6" variant="circular" />
              </div>
              <div className="col-span-2 flex items-center justify-center">
                <Skeleton className="h-7 w-24 rounded-full" />
              </div>
              <div className="col-span-3 flex items-center justify-center">
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default BoardSkeleton;
