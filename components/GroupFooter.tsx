"use client";

import React from "react";
import { Column, Item } from "@/types";

interface GroupFooterProps {
  columns: Column[];
  items: Item[];
  groupColor: string;
}

/**
 * Footer row for each group table.
 * For "numbers" columns, displays the sum of all values in that column.
 * For other column types, renders an empty cell.
 */
export default function GroupFooter({ columns, items, groupColor }: GroupFooterProps) {
  // Only render if there are numbers columns
  const hasNumbersColumn = columns.some((col) => col.type === "numbers");
  if (!hasNumbersColumn) return null;

  return (
    <div className="flex border-t border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/80">
      {/* Color bar spacer */}
      <div className="w-8 shrink-0 border-r border-gray-200 dark:border-slate-600 relative" style={{ backgroundColor: `${groupColor}10` }}>
        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: groupColor }}></div>
      </div>

      {/* Item Name spacer */}
      <div className="w-[300px] p-2 pl-4 border-r border-gray-200 dark:border-slate-600 shrink-0">
        <span className="text-xs font-medium text-gray-400 dark:text-gray-500"></span>
      </div>

      {/* Column cells — only numbers show a sum */}
      {columns.map((col) => {
        const widthClass = col.type === "text" ? "w-48" : col.type === "people" ? "w-36" : "w-32";

        if (col.type === "numbers") {
          const sum = items.reduce((acc, item) => {
            const val = parseFloat(String(item.column_values[col.id] ?? ""));
            return acc + (isNaN(val) ? 0 : val);
          }, 0);

          return (
            <div
              key={col.id}
              className={`${widthClass} border-r border-gray-200 dark:border-slate-600 flex items-center justify-center px-2 shrink-0`}
            >
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                {sum !== 0 ? `Σ ${sum.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
              </span>
            </div>
          );
        }

        return (
          <div key={col.id} className={`${widthClass} border-r border-gray-200 dark:border-slate-600 shrink-0`}></div>
        );
      })}

      {/* Trailing spacer to match the delete button column */}
      <div className="w-16 shrink-0"></div>
    </div>
  );
}
