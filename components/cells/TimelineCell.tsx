"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { Item, Column } from "@/types";
import { DayPicker, DateRange } from "react-day-picker";
import { format } from "date-fns";
import "react-day-picker/dist/style.css"; // Default styles for the calendar

interface TimelineCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
}

export default function TimelineCell({ item, column, onUpdate, activeStatusId, setActiveStatusId }: TimelineCellProps) {
  const value = item.column_values?.[column.id] || null;
  const isEditing = activeStatusId === item.id + column.id;
  
  const setIsEditing = (editing: boolean) => {
    if (setActiveStatusId) {
      setActiveStatusId(editing ? item.id + column.id : null);
    }
  };
  
  // Track range for react-day-picker
  const [range, setRange] = useState<DateRange | undefined>(() => {
    if (value?.start && value?.end) {
      return { from: new Date(value.start), to: new Date(value.end) };
    } else if (value?.start) {
      return { from: new Date(value.start), to: new Date(value.start) };
    }
    return undefined;
  });

  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        handleSave();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isEditing, range]); // Depend on range so it saves the latest state when closing

  // When value prop changes, update local state
  useEffect(() => {
    if (!isEditing) {
      if (value?.start && value?.end) {
        setRange({ from: new Date(value.start), to: new Date(value.end) });
      } else if (value?.start) {
        setRange({ from: new Date(value.start), to: new Date(value.start) });
      } else {
        setRange(undefined);
      }
    }
  }, [value, isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    if (!range?.from) {
      onUpdate(item.id, column.id, null);
    } else {
      // Ensure we have a valid start and end (even if they are the same)
      const startStr = format(range.from, "yyyy-MM-dd");
      const endStr = range.to ? format(range.to, "yyyy-MM-dd") : startStr;
      
      // Only update if changed to avoid unnecessary API calls
      if (value?.start !== startStr || value?.end !== endStr) {
        onUpdate(item.id, column.id, { start: startStr, end: endStr });
      }
    }
  };

  const handleClear = () => {
    setRange(undefined);
    onUpdate(item.id, column.id, null);
    setIsEditing(false);
  };

  // Formatting display text and color for the pill
  let displayText = "-";
  let pillBg = "";
  let pillText = "";
  let isOverdue = false;

  if (value && value.start && value.end) {
    const s = new Date(value.start);
    const e = new Date(value.end);
    
    const formattedStart = format(s, "MMM d");
    const formattedEnd = format(e, "MMM d");
    displayText = formattedStart === formattedEnd ? formattedStart : `${formattedStart} - ${formattedEnd}`;
    
    // Status color logic based on end date
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const endDateOnly = new Date(e);
    endDateOnly.setHours(0, 0, 0, 0);

    if (endDateOnly < now) {
      // Overdue — bold red like Monday.com
      pillBg = "bg-[#e44258]";
      pillText = "text-white";
      isOverdue = true;
    } else if (s <= now && e >= now) {
      // Active — vivid blue
      pillBg = "bg-[#579bfc]";
      pillText = "text-white";
    } else {
      // Future — bright green
      pillBg = "bg-[#00c875]";
      pillText = "text-white";
    }
  } else if (value?.start) {
    displayText = format(new Date(value.start), "MMM d");
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startDate = new Date(value.start);
    startDate.setHours(0, 0, 0, 0);
    
    if (startDate < now) {
      pillBg = "bg-[#e44258]";
      pillText = "text-white";
      isOverdue = true;
    } else {
      pillBg = "bg-[#579bfc]";
      pillText = "text-white";
    }
  }

  const cellRef = useRef<HTMLDivElement>(null);

  // Where to put the calendar.
  //
  // It used to be absolutely positioned and simply flipped above the cell when
  // there was under 380px below. On a short window neither side fits - a row
  // near the top of a new board has little room above it either - so it flipped
  // upwards and ran off the top of the screen, leaving a stub of calendar
  // floating over the header. Position is now measured and clamped so the whole
  // calendar always stays on screen.
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const cell = cellRef.current;
    const pop = popupRef.current;
    if (!cell || !pop) return;
    const c = cell.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const gap = 8;

    let top = c.bottom + gap;
    if (top + p.height > window.innerHeight - gap) {
      const above = c.top - p.height - gap;
      top = above >= gap ? above : c.bottom + gap;
    }
    top = Math.max(gap, Math.min(top, window.innerHeight - p.height - gap));

    let left = c.left + c.width / 2 - p.width / 2;
    left = Math.max(gap, Math.min(left, window.innerWidth - p.width - gap));

    setCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!isEditing) {
      setCoords(null);
      return;
    }
    // Measure-then-position: the popup has to be in the DOM before its size is
    // known, so the placement necessarily lands in state from a layout effect.
    // It runs before paint, so nothing flickers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [isEditing, place]);

  // Handle keyboard events (Enter to save)
  useEffect(() => {
    if (!isEditing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, range]); // Depend on range so save gets the latest state

  return (
    <div
      ref={cellRef}
      className={`${column.width ? '' : 'w-48'} h-full border-r border-gray-200 dark:border-slate-700 shrink-0 relative flex items-center justify-center p-1 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50 group ${isEditing ? "z-50" : ""}`} 
      style={{ width: column.width ? `${column.width}px` : undefined }}
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      {/* Sleek Pill UI */}
      {displayText !== "-" ? (
        <div className={`w-[88%] h-[75%] min-h-[24px] rounded-full flex items-center justify-center text-xs font-bold tracking-wide transition-all duration-200 ${pillBg} ${pillText} shadow-sm hover:shadow-md hover:scale-[1.02] relative`}>
          <span>{displayText}</span>
        </div>
      ) : (
        <div className="w-[88%] h-[75%] min-h-[24px] rounded-full bg-gray-100/50 dark:bg-slate-800/30 flex items-center justify-center text-gray-400 dark:text-gray-500 text-xl pb-1 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
          -
        </div>
      )}

      {/* Popover Dual Calendar UI */}
      {isEditing && (
        <div 
          ref={popupRef}
          style={{
            position: 'fixed',
            top: coords ? coords.top : 0,
            left: coords ? coords.left : 0,
            // Hidden for the first paint only, while it is measured.
            visibility: coords ? 'visible' : 'hidden',
          }}
          className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4 z-[60] animate-in fade-in zoom-in-95 duration-200 cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          <style dangerouslySetInnerHTML={{__html: `
            .rdp { --rdp-cell-size: 32px; margin: 0; }
            .rdp-day { 
              border-radius: 100% !important; 
              transition: background-color 0.2s; 
              background-color: transparent; 
              color: #334155; /* Light mode text */
            }
            .rdp-day_selected, .rdp-day_selected:focus-visible, .rdp-day_selected:hover { 
              background-color: #3b82f6 !important; 
              color: white !important; 
              font-weight: bold; 
            }
            
            /* Middle range styles */
            .rdp-day_range_middle { background-color: #eff6ff !important; color: #1d4ed8 !important; border-radius: 0 !important; }
            
            /* Dark mode specific overrides */
            html.dark .rdp-day { color: #e2e8f0; }
            html.dark .rdp-day_range_middle { background-color: rgba(59, 130, 246, 0.25) !important; color: #bfdbfe !important; border-radius: 0 !important; }
            html.dark .rdp-day:hover:not(.rdp-day_selected) { background-color: #1e293b !important; color: #f8fafc !important; }
            html.dark .rdp-nav_button:hover { background-color: #1e293b !important; }
            html.dark .rdp-day_outside { color: #475569 !important; }
            
            /* Light mode overrides */
            .rdp-day:hover:not(.rdp-day_selected) { background-color: #f1f5f9 !important; }
            .rdp-button:focus-visible:not([disabled]) { outline: 2px solid #3b82f6; }
            .rdp-months { justify-content: center; }
            .rdp-day_outside { color: #cbd5e1 !important; }
          `}} />
          
          <div className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-2 flex justify-between items-center">
            <span>Select Timeline</span>
            <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {range?.from && range?.to 
                ? (format(range.from, "MMM d") === format(range.to, "MMM d") 
                    ? format(range.from, "MMM d") 
                    : `${format(range.from, "MMM d")} - ${format(range.to, "MMM d")}`) 
                : "Sweep to select range"}
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden text-gray-800 dark:text-gray-200 flex justify-center">
            <DayPicker
              mode="range"
              selected={range}
              onSelect={setRange}
              numberOfMonths={1}
              pagedNavigation
              showOutsideDays={false}
              className="font-sans text-sm m-0"
            />
          </div>

          <div className="mt-4 flex justify-between items-center pt-3 border-t border-gray-100 dark:border-slate-800">
            <button 
              onClick={handleClear}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors"
            >
              Clear
            </button>
            <button 
              onClick={handleSave} 
              className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
            >
              Apply <span className="opacity-70 text-[10px] bg-white/20 px-1.5 py-0.5 rounded ml-1">Enter</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
