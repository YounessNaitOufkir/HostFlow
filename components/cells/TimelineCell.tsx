"use client";

import React from "react";
import { Item, Column } from "@/types";
import { format } from "date-fns";
import { useLanguage } from "@/components/LanguageProvider";
import { itemIsDone } from "@/lib/statusSemantics";
import { parseDateOnly, today } from "@/lib/gantt/dates";
import DatePopover from "@/components/ui/DatePopover";

interface TimelineCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
  /** Every column on the board, so the pill can read the item's status. */
  columns?: Column[];
}

export default function TimelineCell({ item, column, onUpdate, columns }: TimelineCellProps) {
  const { dateLocale } = useLanguage();
  const value = item.column_values?.[column.id] || null;
  const start = parseDateOnly(value?.start);
  const end = parseDateOnly(value?.end) ?? start;

  let displayText = "-";
  let pillBg = "";

  // A date in the past is only late if the work is not already finished.
  // Without this, every completed task on the board is painted overdue red.
  const finished = itemIsDone(columns ?? [], item.column_values);

  if (start && end) {
    const [s, e] = end < start ? [end, start] : [start, end];
    const formattedStart = format(s, "MMM d", { locale: dateLocale });
    const formattedEnd = format(e, "MMM d", { locale: dateLocale });
    // A range inside one month repeats the month for no reason: "Feb 20 – 22"
    // is shorter and no less clear. Width matters in the narrow Cards column.
    const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
    displayText =
      formattedStart === formattedEnd
        ? formattedStart
        : sameMonth
          ? `${formattedStart} – ${format(e, "d", { locale: dateLocale })}`
          : `${formattedStart} – ${formattedEnd}`;

    const now = today();
    if (e < now) pillBg = finished ? "bg-[#9aa4b8]" : "bg-[#e44258]";
    else if (s <= now) pillBg = "bg-[#579bfc]";
    else pillBg = "bg-[#00c875]";
  }

  return (
    <DatePopover
      mode="range"
      align="center"
      portal
      value={{ start: value?.start ?? null, end: value?.end ?? null }}
      onCommit={(next) => onUpdate(item.id, column.id, next.start ? { start: next.start, end: next.end } : null)}
      className={`${column.width ? "" : "w-48"} h-full border-r border-gray-200 dark:border-slate-700 shrink-0 flex items-center justify-center p-1 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50 group`}
      style={{ width: column.width ? `${column.width}px` : undefined }}
    >
      {displayText !== "-" ? (
        // Height comes from padding and the text never wraps, so a long range
        // ellipsises inside the pill instead of spilling out of it.
        <div className={`w-[88%] max-w-full min-w-0 py-1 min-h-[24px] px-2.5 rounded-full flex items-center justify-center text-xs font-bold tracking-wide transition-all duration-200 ${pillBg} text-white shadow-sm hover:shadow-md hover:scale-[1.02] relative`}>
          <span className="truncate whitespace-nowrap" title={displayText}>{displayText}</span>
        </div>
      ) : (
        <div className="w-[88%] max-w-full py-1 min-h-[24px] rounded-full bg-gray-100/50 dark:bg-slate-800/30 flex items-center justify-center text-gray-400 dark:text-gray-500 text-xl pb-1 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
          -
        </div>
      )}
    </DatePopover>
  );
}
