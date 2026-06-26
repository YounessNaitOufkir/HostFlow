"use client";

import React, { useMemo } from "react";
import { Board, Item, Group } from "@/types";
import { format, differenceInDays, addDays, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval, min, max } from "date-fns";

interface GanttViewProps {
  board: Board | null;
  items: Item[];
  groups: Group[];
}

export default function GanttView({ board, items, groups }: GanttViewProps) {
  // Find date or timeline columns
  const dateColumns = useMemo(() => {
    return board?.columns.filter(c => c.type === "date" || c.type === "timeline") || [];
  }, [board]);

  // Extract plottable items
  const ganttItems = useMemo(() => {
    const plottedItems: { item: Item; start: Date; end: Date; color: string; groupTitle: string }[] = [];
    
    if (dateColumns.length === 0) return [];

    items.forEach(item => {
      let start: Date | null = null;
      let end: Date | null = null;

      for (const col of dateColumns) {
        const val = item.column_values[col.id];
        if (!val) continue;

        if (col.type === "date") {
          start = new Date(val);
          end = new Date(val);
        } else if (col.type === "timeline" && val.start && val.end) {
          start = new Date(val.start);
          end = new Date(val.end);
        }
        if (start && end) break;
      }

      if (start && end) {
        const group = groups.find(g => g.id === item.group_id);
        plottedItems.push({
          item,
          start,
          end,
          color: group?.color || "#579bfc",
          groupTitle: group?.title || "Unknown Group"
        });
      }
    });

    return plottedItems;
  }, [items, dateColumns, groups]);

  // Calculate global start and end bounds
  const { chartStart, chartEnd, totalDays } = useMemo(() => {
    if (ganttItems.length === 0) {
      // Default to current month if no data
      const today = new Date();
      return { 
        chartStart: startOfWeek(today), 
        chartEnd: addDays(today, 30), 
        totalDays: 30 
      };
    }

    const startDates = ganttItems.map(gi => gi.start);
    const endDates = ganttItems.map(gi => gi.end);

    // Buffer by 3 days before earliest and 7 days after latest
    const minStart = addDays(min(startDates), -3);
    const maxEnd = addDays(max(endDates), 7);
    
    const days = differenceInDays(maxEnd, minStart) + 1;

    return { chartStart: minStart, chartEnd: maxEnd, totalDays: days > 14 ? days : 14 };
  }, [ganttItems]);

  const daysArray = useMemo(() => {
    return Array.from({ length: totalDays }).map((_, i) => addDays(chartStart, i));
  }, [chartStart, totalDays]);

  if (!board) return null;

  if (dateColumns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-8">
        <div className="text-center bg-white dark:bg-slate-900 p-8 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gantt Chart Needs Dates</h2>
          <p className="text-gray-500 dark:text-gray-400">Add a <strong>Timeline</strong> or <strong>Date</strong> column to your board to use the Gantt chart.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden relative">
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-950/50 p-8">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden min-w-max">
          
          {/* Header Row (Months / Weeks) */}
          <div className="flex border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50">
            {/* Left label spacing */}
            <div className="w-[250px] shrink-0 border-r border-gray-200 dark:border-slate-800 p-3 flex items-end">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Item Name</span>
            </div>
            
            {/* Days axis */}
            <div className="flex-1 flex" style={{ minWidth: `${totalDays * 40}px` }}>
              {daysArray.map((date, i) => (
                <div key={i} className="flex-1 min-w-[40px] flex flex-col items-center justify-end pb-2 border-r border-gray-100 dark:border-slate-800/50 last:border-r-0">
                  <span className="text-[10px] font-medium text-gray-400">{format(date, "EEE")}</span>
                  <span className={`text-xs font-semibold mt-0.5 ${isSameDay(date, new Date()) ? 'w-5 h-5 flex items-center justify-center bg-blue-500 text-white rounded-full' : 'text-gray-600 dark:text-gray-300'}`}>
                    {format(date, "d")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Grid Body */}
          <div className="flex flex-col relative">
            {/* Vertical lines for days (Background layer) */}
            <div className="absolute top-0 bottom-0 left-[250px] right-0 flex pointer-events-none opacity-50 z-0" style={{ minWidth: `${totalDays * 40}px` }}>
              {daysArray.map((date, i) => (
                <div key={i} className={`flex-1 min-w-[40px] border-r border-gray-100 dark:border-slate-800/50 ${isSameDay(date, new Date()) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}></div>
              ))}
            </div>

            {/* Gantt Rows */}
            {ganttItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500 z-10">No items with valid dates found.</div>
            ) : (
              ganttItems.map((gi) => {
                // Calculate grid column positioning
                const startIndex = differenceInDays(gi.start, chartStart);
                const endIndex = differenceInDays(gi.end, chartStart);
                
                // Ensure bounds
                const safeStart = Math.max(0, startIndex);
                const safeEnd = Math.min(totalDays - 1, endIndex);
                const duration = safeEnd - safeStart + 1;

                // Calculate percentages for CSS placement
                const leftPercent = (safeStart / totalDays) * 100;
                const widthPercent = (duration / totalDays) * 100;

                return (
                  <div key={gi.item.id} className="flex border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors z-10 relative">
                    {/* Item Name */}
                    <div className="w-[250px] shrink-0 border-r border-gray-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 z-20 flex items-center">
                      <div className="w-2 h-2 rounded-full mr-3 shrink-0" style={{ backgroundColor: gi.color }}></div>
                      <div className="truncate text-sm font-medium text-gray-700 dark:text-gray-200" title={gi.item.name}>
                        {gi.item.name}
                      </div>
                    </div>
                    
                    {/* Gantt Track */}
                    <div className="flex-1 relative py-2" style={{ minWidth: `${totalDays * 40}px` }}>
                      <div 
                        className="absolute top-1/2 -translate-y-1/2 h-6 rounded-md shadow-sm group cursor-pointer flex items-center overflow-hidden"
                        style={{ 
                          left: `${leftPercent}%`, 
                          width: `${widthPercent}%`,
                          backgroundColor: gi.color 
                        }}
                      >
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="text-[10px] text-white font-medium px-2 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {format(gi.start, "MMM d")} - {format(gi.end, "MMM d")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
