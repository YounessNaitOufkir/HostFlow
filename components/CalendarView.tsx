"use client";

import React, { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useT } from "@/components/LanguageProvider";
import { displayColumnTitle, displayCellLabel, displayStatus } from "@/lib/i18n/labels";
import { Board, Item, Group, Column, STATUS_OPTIONS, PRIORITY_OPTIONS, Profile } from "@/types";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, 
  addMonths, subMonths, getDay, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays 
} from "date-fns";
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter,
  X, ArrowRight, Folder, Clock, User, Link2, Tag, CheckCircle, AlignLeft, Type, Hash, CheckSquare, MoreHorizontal, LayoutList
} from "lucide-react";
import { statusHexOr } from "@/lib/statusColor";
import { useLanguage } from "@/components/LanguageProvider";

interface CalendarViewProps {
  board: Board | null;
  items: Item[];
  groups: Group[];
  profiles?: Profile[];
}


export default function CalendarView({ board, items, groups, profiles }: CalendarViewProps) {
  // dateLocale as well as t: month names and weekday headings are half of what
  // makes a calendar feel like it is in your language.
  const { t, dateLocale } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("month");
  const [colorBy, setColorBy] = useState<"group" | "status">("status");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  // Find the date or timeline columns to use for plotting
  const dateColumns = useMemo(() => {
    return board?.columns.filter(c => c.type === "date" || c.type === "timeline") || [];
  }, [board]);

  const statusColumn = useMemo(() => {
    return board?.columns.find(c => c.type === "status");
  }, [board]);

  // Extract items that have dates
  const calendarItems = useMemo(() => {
    const plottedItems: { item: Item; start: Date; end: Date; groupColor: string; statusColor: string; statusLabel: string }[] = [];
    
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
        
        let statusColor = "#c4c4c4"; // Gray default
        let statusLabel = "Not Started";
        if (statusColumn) {
          const val = item.column_values[statusColumn.id];
          if (val) {
            statusLabel = val;
            const opt = STATUS_OPTIONS.find(o => o.label === val);
            if (opt) {
              statusColor = statusHexOr(opt.color);
            }
          }
        }

        plottedItems.push({
          item,
          start: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
          end: new Date(end.getFullYear(), end.getMonth(), end.getDate()),
          groupColor: group?.color || "#579bfc",
          statusColor,
          statusLabel
        });
      }
    });

    return plottedItems;
  }, [items, dateColumns, groups, statusColumn]);

  const handlePrev = () => {
    if (viewMode === "month") setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const handleNext = () => {
    if (viewMode === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  // Group days into weeks for row-based layout
  const weekRows = useMemo(() => {
    let gridStart, gridEnd;
    if (viewMode === "month") {
      gridStart = startOfWeek(startOfMonth(currentDate));
      gridEnd = endOfWeek(endOfMonth(currentDate));
    } else if (viewMode === "week") {
      gridStart = startOfWeek(currentDate);
      gridEnd = endOfWeek(currentDate);
    } else {
      gridStart = currentDate;
      gridEnd = currentDate;
    }
    
    const allDaysInGrid = eachDayOfInterval({ start: gridStart, end: gridEnd });
    
    const rows: Date[][] = [];
    if (viewMode === "day") {
      rows.push([currentDate]);
    } else {
      for (let i = 0; i < allDaysInGrid.length; i += 7) {
        rows.push(allDaysInGrid.slice(i, i + 7));
      }
    }
    return rows;
  }, [currentDate, viewMode]);

  // Helper to process events for a given week row
  const processWeekEvents = (weekDays: Date[]) => {
    const weekStart = weekDays[0];
    const weekEnd = weekDays[weekDays.length - 1];
    
    // Filter items that overlap with this week
    const weekItems = calendarItems.map(ci => {
      // In month view, we clamp the visual start/end so bars don't bleed into padding days
      let vStart = ci.start;
      let vEnd = ci.end;
      
      if (viewMode === "month") {
        const mStart = startOfMonth(currentDate);
        const mEnd = endOfMonth(currentDate);
        if (vStart < mStart) vStart = mStart;
        if (vEnd > mEnd) vEnd = mEnd;
      }
      
      return { ...ci, vStart, vEnd };
    }).filter(ci => {
      // Ensure it's still a valid duration and overlaps the week
      return ci.vStart <= ci.vEnd && ci.vStart <= weekEnd && ci.vEnd >= weekStart;
    });

    // Sort by visual start date, then duration (longer first)
    weekItems.sort((a, b) => {
      const aStart = a.vStart.getTime();
      const bStart = b.vStart.getTime();
      if (aStart !== bStart) return aStart - bStart;
      return (b.vEnd.getTime() - b.vStart.getTime()) - (a.vEnd.getTime() - a.vStart.getTime());
    });

    // Bin packing to find row indices
    const rows: any[][] = [];
    const eventLayouts = weekItems.map(ci => {
      let startIdx = 0;
      if (ci.vStart > weekStart) {
        startIdx = Math.round((ci.vStart.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      let endIdx = weekDays.length - 1;
      if (ci.vEnd < weekEnd) {
        endIdx = Math.round((ci.vEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Ensure boundaries
      startIdx = Math.max(0, Math.min(startIdx, weekDays.length - 1));
      endIdx = Math.max(0, Math.min(endIdx, weekDays.length - 1));

      // Find first available row
      let rowIndex = 0;
      while (true) {
        if (!rows[rowIndex]) rows[rowIndex] = [];
        const overlap = rows[rowIndex].some(existing => {
          return !(endIdx < existing.startIdx || startIdx > existing.endIdx);
        });
        if (!overlap) {
          rows[rowIndex].push({ startIdx, endIdx });
          break;
        }
        rowIndex++;
      }

      return {
        item: ci.item,
        color: colorBy === "status" ? ci.statusColor : ci.groupColor,
        startIdx,
        endIdx,
        rowIndex,
        isContinuedFromPrev: ci.start < weekStart,
        isContinuedToNext: ci.end > weekEnd
      };
    });

    return { eventLayouts, maxRows: rows.length };
  };

  // Build the legend based on colorBy selection
  const legendItems = useMemo(() => {
    if (colorBy === "status") {
      // Find all unique statuses from items
      const uniqueStatuses = new Map<string, string>();
      calendarItems.forEach(ci => {
        if (!uniqueStatuses.has(ci.statusLabel)) {
          uniqueStatuses.set(ci.statusLabel, ci.statusColor);
        }
      });
      return Array.from(uniqueStatuses.entries()).map(([label, color]) => ({
        label: displayStatus(t, label),
        color,
      }));
    } else {
      // Show all groups on the board in the legend
      return groups.map(g => ({
        label: (g as any).title || t("cal.untitledGroup"),
        color: g.color || "#579bfc"
      }));
    }
  }, [calendarItems, colorBy, groups, t]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-gray-100 dark:bg-slate-800 p-1 rounded-md">
            {(["day", "week", "month"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-sm font-medium rounded capitalize transition-all ${
                  viewMode === mode 
                    ? "bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm" 
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {t(mode === "day" ? "cal.day" : mode === "week" ? "cal.week" : "cal.month")}
              </button>
            ))}
          </div>

          <h2 className="text-xl font-semibold text-gray-800 dark:text-white min-w-[150px]">
            {viewMode === "day" && format(currentDate, "d MMMM yyyy", { locale: dateLocale })}
            {viewMode === "week" &&
              `${format(startOfWeek(currentDate), "d MMM", { locale: dateLocale })} - ${format(endOfWeek(currentDate), "d MMM yyyy", { locale: dateLocale })}`}
            {viewMode === "month" && format(currentDate, "MMMM yyyy", { locale: dateLocale })}
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center mr-4 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md p-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 uppercase tracking-wide">{t("cal.colorBy")}</span>
            <button 
              onClick={() => setColorBy("group")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${colorBy === "group" ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50"}`}
            >
              {t("cal.byGroup")}
            </button>
            <button 
              onClick={() => setColorBy("status")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${colorBy === "status" ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50"}`}
            >
              {t("cal.byStatus")}
            </button>
          </div>

          <button onClick={handlePrev} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded transition-colors text-gray-600 dark:text-gray-300">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-800 rounded transition-colors text-gray-600 dark:text-gray-300">
            {t("cal.today")}
          </button>
          <button onClick={handleNext} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded transition-colors text-gray-600 dark:text-gray-300">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {dateColumns.length === 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 p-4 text-sm text-center">
          {t("cal.needsDates")}
        </div>
      )}

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto bg-gray-100 dark:bg-slate-900 p-6 flex flex-col">
        <div className="min-w-[800px] flex-1 flex flex-col bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden relative">
          
          {/* Day Names */}
          {viewMode !== "day" && (
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 shrink-0">
              {eachDayOfInterval({
                start: startOfWeek(currentDate),
                end: endOfWeek(currentDate),
              }).map(day => (
                <div key={day.toISOString()} className="py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-slate-800 last:border-r-0">
                  {format(day, "EEE", { locale: dateLocale })}
                </div>
              ))}
            </div>
          )}
          {viewMode === "day" && (
            <div className="border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 shrink-0 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {format(currentDate, "EEEE")}
            </div>
          )}

          {/* Week Rows Grid */}
          <div className="flex-1 flex flex-col overflow-y-auto min-h-0">
            {weekRows.map((weekDays, weekIdx) => {
              const { eventLayouts, maxRows } = processWeekEvents(weekDays);
              // Calculate a minimum height for the week row so it can contain all overlapping events
              const rowHeight = Math.max(120, maxRows * 26 + 40); // 26px per event + top padding
              const colCount = weekDays.length;

              return (
                <div key={`week-${weekIdx}`} className="relative border-b border-gray-200 dark:border-slate-800 flex-1 flex flex-col" style={{ minHeight: `${rowHeight}px` }}>
                  {/* Background grid for days */}
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                    {weekDays.map((date, dayIdx) => {
                      const isToday = isSameDay(date, new Date());
                      const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                      return (
                        <div key={`bg-${dayIdx}`} className={`border-r border-gray-100 dark:border-slate-800/50 p-2 ${!isCurrentMonth && viewMode === "month" ? "bg-gray-50/50 dark:bg-slate-900/30" : ""}`}>
                          {(!(!isCurrentMonth && viewMode === "month")) && (
                            <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ml-auto ${
                              isToday ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20' : 'text-gray-600 dark:text-gray-400'
                            }`}>
                              {format(date, "d")}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Events Layer */}
                  <div className="relative flex-1 mt-10 overflow-hidden pointer-events-none">
                    <div className="absolute inset-0" style={{ height: `${rowHeight}px` }}>
                      {eventLayouts.map((layout, i) => {
                        const top = layout.rowIndex * 26; // 24px height + 2px margin
                        const left = (layout.startIdx / colCount) * 100;
                        const width = ((layout.endIdx - layout.startIdx + 1) / colCount) * 100;
                        
                        let roundedClass = "rounded-md";
                        if (layout.isContinuedFromPrev && layout.isContinuedToNext) roundedClass = "rounded-none";
                        else if (layout.isContinuedFromPrev) roundedClass = "rounded-r-md";
                        else if (layout.isContinuedToNext) roundedClass = "rounded-l-md";

                        return (
                          <div
                            key={`${layout.item.id}-${weekIdx}`}
                            onClick={() => setSelectedItem(layout.item)}
                            className={`absolute h-5 px-2 py-0.5 text-[11px] font-medium text-white truncate shadow-sm cursor-pointer hover:opacity-90 transition-opacity pointer-events-auto flex items-center ${roundedClass}`}
                            style={{
                              top: `${top}px`,
                              left: `calc(${left}% + 4px)`,
                              width: `calc(${width}% - 8px)`,
                              backgroundColor: layout.color
                            }}
                          >
                            <TruncatedText className="truncate block w-full">{layout.item.name}</TruncatedText>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        {legendItems.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 shrink-0">
            {legendItems.map((legend, idx) => (
              <div key={idx} className="flex items-center space-x-1.5 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-full border border-gray-200 dark:border-slate-700 shadow-sm">
                <span className="w-3 h-3 rounded-full shadow-inner" style={{ backgroundColor: legend.color }}></span>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{legend.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task Info Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/20 dark:bg-slate-950/60 backdrop-blur-sm transition-opacity"></div>
          
          {/* Modal Content */}
          <div 
            className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-slate-800 relative bg-gray-50/50 dark:bg-slate-800/30">
              <button 
                onClick={() => setSelectedItem(null)} 
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white pr-8 mb-1 leading-tight">{selectedItem.name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                in <ArrowRight size={14} className="opacity-70" /> {board?.name || "Board"}
              </p>
            </div>
            
            {/* Body */}
            <div className="px-6 py-4 overflow-y-auto max-h-[65vh] space-y-4">
              
              {/* Built-in Group Row */}
              <div className="grid grid-cols-12 gap-4 items-center group min-h-[32px]">
                <div className="col-span-4 flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Folder size={16} className="text-yellow-500" />
                  <span className="text-sm font-medium truncate">Group</span>
                </div>
                <div className="col-span-8 flex items-center justify-center bg-gray-50 dark:bg-slate-800/50 min-h-[36px] rounded p-1">
                  {(() => {
                    const group = groups.find(g => g.id === selectedItem.group_id);
                    return (
                      <div className="flex items-center justify-center gap-2 text-[13px] text-gray-800 dark:text-gray-200 w-full text-center">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group?.color || "#579bfc" }}></div>
                        <span>{(group as any)?.title || "Group"}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Dynamic Columns */}
              {board?.columns.map(col => {
                const val = selectedItem.column_values[col.id];
                
                // Determine icon based on column type
                let Icon = AlignLeft;
                let iconColor = "text-gray-400";
                if (col.type === "status" || col.type === "priority") { Icon = CheckCircle; iconColor = "text-emerald-500"; }
                else if (col.type === "timeline" || col.type === "date") { Icon = Clock; iconColor = "text-purple-500"; }
                else if (col.type === "people") { Icon = User; iconColor = "text-blue-500"; }
                else if (col.type === "dependency") { Icon = Link2; iconColor = "text-red-500"; }
                else if (col.type === "tags") { Icon = Tag; iconColor = "text-emerald-500"; }
                
                return (
                  <div key={col.id} className="grid grid-cols-12 gap-4 items-center group min-h-[32px]">
                    <div className="col-span-4 flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Icon size={16} className={iconColor} />
                      <TruncatedText className="text-sm font-medium truncate">{displayColumnTitle(t, col.title)}</TruncatedText>
                    </div>
                    <div className="col-span-8 flex items-center bg-gray-50 dark:bg-slate-800/50 min-h-[36px] rounded p-1">
                      {/* Render Cell Value */}
                      {(() => {
                        if (val === undefined || val === null || val === "") return <span className="text-gray-400 text-xs px-2 w-full text-center">-</span>;
                        
                        if (col.type === "status" || col.type === "priority") {
                          const options = col.settings?.statusLabels || (col.type === "status" ? STATUS_OPTIONS : PRIORITY_OPTIONS);
                          const opt = options.find(o => o.label === val);
                          const bg = statusHexOr(opt?.color);
                          return (
                            <div className="w-full text-center py-1.5 text-white text-[13px] font-medium flex items-center justify-center gap-1.5" style={{ backgroundColor: bg }}>
                              <span>{displayCellLabel(t, col.type, val as string)}</span>
                              {val === "Critical" && <span className="text-[11px] leading-none">⚠️</span>}
                            </div>
                          );
                        }
                        if (col.type === "timeline") {
                          return (
                            <div className="w-full text-center py-1.5 bg-emerald-500 text-white text-[13px] font-medium rounded-full flex items-center justify-center gap-1.5 px-3">
                              <CheckCircle size={14} className="opacity-90" />
                              <span>{val.start ? format(new Date(val.start), "MMM d") : ""} - {val.end ? format(new Date(val.end), "MMM d") : ""}</span>
                            </div>
                          );
                        }
                        if (col.type === "people") {
                          return (
                            <div className="flex items-center justify-center gap-1.5 w-full">
                              {(Array.isArray(val) ? val : [val]).map((id: string, i: number) => {
                                const p = profiles?.find(prof => prof.id === id);
                                return (
                                  <Avatar
                                    key={i}
                                    name={p?.full_name}
                                    initials={p?.avatar_initials}
                                    url={p?.avatar_url}
                                    color={p?.color}
                                    size={28}
                                    title={p?.full_name || p?.email || "Unknown"}
                                    className="border border-white dark:border-slate-800"
                                  />
                                );
                              })}
                            </div>
                          );
                        }
                        if (col.type === "tags") {
                          return (
                            <div className="flex items-center justify-center gap-1.5 flex-wrap w-full">
                              {(Array.isArray(val) ? val : [val]).map((t: string, i: number) => (
                                <span key={i} className="px-2.5 py-0.5 bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[13px] rounded">{t}</span>
                              ))}
                            </div>
                          );
                        }
                        if (col.type === "dependency") {
                          const depIds = Array.isArray(val) ? val : [val];
                          const depNames = depIds.map((id: string) => items.find(it => it.id === id)?.name).filter(Boolean);
                          const text = depNames.length > 0 ? depNames.join(", ") : val.linked_item_name || "Linked Item";
                          
                          return (
                            <TruncatedText as="div" className="w-full text-center px-2 py-1 bg-blue-50/80 dark:bg-slate-800 text-blue-700 dark:text-blue-300 text-[13px] rounded border border-blue-100 dark:border-slate-700 truncate">
                              {text}
                            </TruncatedText>
                          );
                        }
                        
                        // Default fallback
                        return <TruncatedText as="div" className="text-[13px] px-2 text-gray-700 dark:text-gray-300 w-full text-center truncate">
                          {typeof val === "object" ? JSON.stringify(val) : String(val)}
                        </TruncatedText>;
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
