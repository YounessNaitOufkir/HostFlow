"use client";

import React, { useState } from "react";
import { Item, Column } from "@/types";

interface TimelineCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function TimelineCell({ item, column, onUpdate }: TimelineCellProps) {
  // Value will be stored as { start: string, end: string } or null
  const value = item.column_values?.[column.id] || null;
  const [isEditing, setIsEditing] = useState(false);
  const [tempStart, setTempStart] = useState(value?.start || "");
  const [tempEnd, setTempEnd] = useState(value?.end || "");

  const handleSave = () => {
    setIsEditing(false);
    if (!tempStart && !tempEnd) {
      onUpdate(item.id, column.id, null);
    } else {
      onUpdate(item.id, column.id, { start: tempStart, end: tempEnd });
    }
  };

  if (isEditing) {
    return (
      <div className="w-48 border-r border-gray-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900 flex items-center justify-center p-1 relative z-10">
        <div className="flex items-center space-x-1 w-full bg-white dark:bg-slate-800 rounded shadow-lg p-1 border border-blue-500">
          <input
            type="date"
            value={tempStart}
            onChange={(e) => setTempStart(e.target.value)}
            className="w-full text-xs border border-gray-300 dark:border-slate-600 rounded p-0.5 bg-transparent"
          />
          <span className="text-gray-400 text-xs">-</span>
          <input
            type="date"
            value={tempEnd}
            onChange={(e) => setTempEnd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="w-full text-xs border border-gray-300 dark:border-slate-600 rounded p-0.5 bg-transparent"
          />
          <button onClick={handleSave} className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">✓</button>
        </div>
        {/* Backdrop to close */}
        <div className="fixed inset-0 z-[-1]" onClick={handleSave} />
      </div>
    );
  }

  // Formatting display
  let displayText = "-";
  let displayColor = "bg-gray-100 dark:bg-slate-800";
  let textColor = "text-gray-500 dark:text-gray-400";
  let widthPercent = 100;

  if (value && value.start && value.end) {
    const s = new Date(value.start);
    const e = new Date(value.end);
    
    const formattedStart = s.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const formattedEnd = e.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    displayText = `${formattedStart} - ${formattedEnd}`;
    
    // Some basic color logic: if past due -> red, if active -> blue, if future -> gray
    const now = new Date();
    if (e < now) {
      displayColor = "bg-red-500";
      textColor = "text-white";
    } else if (s <= now && e >= now) {
      displayColor = "bg-blue-500";
      textColor = "text-white";
    } else {
      displayColor = "bg-gray-400 dark:bg-gray-600";
      textColor = "text-white";
    }
  } else if (value?.start || value?.end) {
    // Only one date
    const d = new Date(value.start || value.end);
    displayText = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    displayColor = "bg-gray-300 dark:bg-slate-600";
    textColor = "text-white";
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="w-48 border-r border-gray-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900 flex items-center justify-center p-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
    >
      {displayText !== "-" ? (
        <div className={`w-full h-full rounded-full flex items-center justify-center ${displayColor} ${textColor} text-xs font-medium px-2 py-0.5`}>
          {displayText}
        </div>
      ) : (
        <div className="w-full h-full rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-400 dark:text-gray-500 text-xl pb-1 hover:bg-gray-200 dark:hover:bg-slate-700">
          -
        </div>
      )}
    </div>
  );
}
