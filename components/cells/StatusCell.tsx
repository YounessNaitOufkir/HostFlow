"use client";

import React from "react";
import { Item, Column, STATUS_OPTIONS } from "@/types";
import { Clock } from "lucide-react";

interface StatusCellProps {
  item: Item;
  column: Column;
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  dropdownDirection?: "up" | "down";
}

export default function StatusCell({
  item,
  column,
  activeStatusId,
  setActiveStatusId,
  onUpdate,
  dropdownDirection = "down",
}: StatusCellProps) {
  const value = item.column_values[column.id];
  const cellKey = `${item.id}-${column.id}`;
  const isOverdue = value === "Overdue";
  const currentOptions = column.settings?.statusLabels || STATUS_OPTIONS;
  const option = currentOptions.find((opt: any) => opt.label === value);
  const bgColor = option ? option.color : (isOverdue ? "bg-gradient-to-r from-red-600 to-rose-600" : "bg-[#c4c4c4]");

  return (
    <div className={`${column.width ? '' : 'w-32'} border-r border-gray-200 dark:border-slate-700 p-[2px] relative flex items-center justify-center shrink-0 ${activeStatusId === cellKey ? "z-50" : ""}`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          setActiveStatusId?.(activeStatusId === cellKey ? null : cellKey);
        }}
        className={`relative cursor-pointer w-full h-full flex items-center justify-center text-white text-xs font-semibold rounded-[3px] hover:opacity-85 transition-all ${bgColor} ${
          isOverdue ? "shadow-sm border border-red-500/40 dark:border-red-400/50" : ""
        }`}
      >
        {isOverdue && (
          <Clock size={11} className="absolute top-1 right-1.5 animate-pulse stroke-[2.5] drop-shadow-sm" />
        )}
        <span>{value || ""}</span>
      </div>

      {activeStatusId === cellKey && (
        <div className={`absolute ${dropdownDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} w-[140px] dropdown-menu p-1.5 z-50 flex flex-col space-y-0.5`}>
          {currentOptions.map((opt) => (
            <button
              key={opt.label}
              onClick={(e) => {
                e.stopPropagation();
                onUpdate(item.id, column.id, opt.label);
              }}
              className={`${opt.color} text-white text-xs font-semibold py-2 px-3 rounded-[3px] text-center hover:opacity-90 transition-all shadow-sm`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
