"use client";

import React, { useRef } from "react";
import { Item, Column } from "@/types";
import { Calendar, X } from "lucide-react";

interface DateCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function DateCell({ item, column, onUpdate }: DateCellProps) {
  const value = item.column_values[column.id] || "";
  const inputRef = useRef<HTMLInputElement>(null);

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return null;
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const formatted = formatDisplayDate(value);
  const isOverdue = Object.values(item.column_values || {}).includes("Overdue");

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(item.id, column.id, "");
  };

  return (
    <div 
      onClick={() => inputRef.current?.showPicker?.() || inputRef.current?.focus()}
      className={`${column.width ? '' : 'w-32'} group relative border-r border-gray-200 dark:border-slate-700 flex items-center justify-center text-xs text-gray-600 dark:text-gray-300 shrink-0 hover:bg-gray-100/60 dark:hover:bg-slate-700/40 transition-colors cursor-pointer px-2 select-none`} 
      style={{ width: column.width ? `${column.width}px` : undefined }}
    >
      {formatted ? (
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium transition-colors ${
          isOverdue 
            ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 border border-red-300/80 dark:border-red-500/50" 
            : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
        }`}>
          <Calendar size={12} className="opacity-70" />
          <span>{formatted}</span>
          <button
            onClick={handleClear}
            className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity p-0.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30"
            title="Clear date"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500 opacity-60 group-hover:opacity-100 transition-opacity">
          <Calendar size={13} />
          <span className="text-[11px]">-</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onUpdate(item.id, column.id, e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer pointer-events-none"
      />
    </div>
  );
}
