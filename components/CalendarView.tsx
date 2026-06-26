"use client";

import React, { useMemo, useState } from "react";
import { Board, Item, Group, Column } from "@/types";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

interface CalendarViewProps {
  board: Board | null;
  items: Item[];
  groups: Group[];
}

export default function CalendarView({ board, items, groups }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Find the date or timeline columns to use for plotting
  const dateColumns = useMemo(() => {
    return board?.columns.filter(c => c.type === "date" || c.type === "timeline") || [];
  }, [board]);

  // Extract items that have dates
  const calendarItems = useMemo(() => {
    const plottedItems: { item: Item; start: Date; end: Date; color: string }[] = [];
    
    if (dateColumns.length === 0) return [];

    items.forEach(item => {
      // Pick the first populated date/timeline column
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
          color: group?.color || "#579bfc"
        });
      }
    });

    return plottedItems;
  }, [items, dateColumns, groups]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Pad beginning of month
  const startDayOfWeek = getDay(monthStart);
  const paddingDays = Array.from({ length: startDayOfWeek }).map((_, i) => i);

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  if (!board) return null;

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
      
      {/* Calendar Header */}
      <div className="h-16 shrink-0 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between px-8 bg-gray-50 dark:bg-slate-900">
        <div className="flex items-center space-x-4">
          <CalendarIcon className="text-gray-400 dark:text-gray-500" />
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {format(currentDate, "MMMM yyyy")}
          </h2>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded transition-colors text-gray-600 dark:text-gray-300">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-800 rounded transition-colors text-gray-600 dark:text-gray-300">
            Today
          </button>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded transition-colors text-gray-600 dark:text-gray-300">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {dateColumns.length === 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 p-4 text-sm text-center">
          You need to add a <strong>Date</strong> or <strong>Timeline</strong> column to your board to see items here!
        </div>
      )}

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto bg-gray-100 dark:bg-slate-900 p-6">
        <div className="min-w-[800px] h-full flex flex-col bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
          
          {/* Day Names */}
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 shrink-0">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
              <div key={day} className="py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-slate-800 last:border-r-0">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="flex-1 grid grid-cols-7 grid-rows-5 auto-rows-fr">
            {paddingDays.map(i => (
              <div key={`pad-${i}`} className="border-r border-b border-gray-100 dark:border-slate-800/50 bg-gray-50 dark:bg-slate-900/50"></div>
            ))}
            
            {daysInMonth.map((date, idx) => {
              const isToday = isSameDay(date, new Date());
              
              // Find items that overlap with this day
              const dayItems = calendarItems.filter(ci => {
                // Ignore time component for simple date comparison
                const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                const s = new Date(ci.start.getFullYear(), ci.start.getMonth(), ci.start.getDate());
                const e = new Date(ci.end.getFullYear(), ci.end.getMonth(), ci.end.getDate());
                return d >= s && d <= e;
              });

              return (
                <div key={date.toString()} className="border-r border-b border-gray-100 dark:border-slate-800 min-h-[100px] p-1 flex flex-col relative overflow-hidden group/day">
                  <div className="flex justify-between items-center p-1 mb-1">
                    <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {format(date, "d")}
                    </span>
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-1 overflow-y-auto no-scrollbar">
                    {dayItems.map((ci, i) => {
                      // Determine if this is the start or end of a multi-day span to round corners
                      const isStart = isSameDay(ci.start, date);
                      const isEnd = isSameDay(ci.end, date);
                      
                      let roundedClass = "rounded-sm";
                      if (isStart && isEnd) roundedClass = "rounded-md";
                      else if (isStart) roundedClass = "rounded-l-md";
                      else if (isEnd) roundedClass = "rounded-r-md";

                      return (
                        <div 
                          key={ci.item.id}
                          className={`text-[10px] px-1.5 py-1 text-white font-medium truncate shrink-0 ${roundedClass} shadow-sm`}
                          style={{ backgroundColor: ci.color }}
                          title={ci.item.name}
                        >
                          {isStart ? ci.item.name : '\u00A0'}
                        </div>
                      )
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
