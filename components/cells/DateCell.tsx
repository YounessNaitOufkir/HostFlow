"use client";

import React from "react";
import { Item, Column } from "@/types";
import { Calendar, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { parseDateOnly } from "@/lib/gantt/dates";
import DatePopover from "@/components/ui/DatePopover";

interface DateCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function DateCell({ item, column, onUpdate }: DateCellProps) {
  const { bcp47, t } = useLanguage();
  const value: string = item.column_values[column.id] || "";
  const date = parseDateOnly(value);
  const formatted = date ? date.toLocaleDateString(bcp47, { month: "short", day: "numeric" }) : null;
  const isOverdue = Object.values(item.column_values || {}).includes("Overdue");

  return (
    <DatePopover
      mode="single"
      portal
      value={{ start: date ? value : null, end: null }}
      onCommit={(next) => onUpdate(item.id, column.id, next.start ?? "")}
      className={`${column.width ? "" : "w-32"} group border-r border-gray-200 dark:border-slate-700 flex items-center justify-center text-xs text-gray-600 dark:text-gray-300 shrink-0 hover:bg-gray-100/60 dark:hover:bg-slate-700/40 transition-colors cursor-pointer px-2 select-none focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:-outline-offset-2`}
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
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(item.id, column.id, "");
            }}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500 transition-opacity p-0.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30"
            title={t("date.clearOne")}
            aria-label={t("date.clearOne")}
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
    </DatePopover>
  );
}
