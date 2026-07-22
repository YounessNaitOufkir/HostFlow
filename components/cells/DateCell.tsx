"use client";

import React from "react";
import { Item, Column } from "@/types";

interface DateCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function DateCell({ item, column, onUpdate }: DateCellProps) {
  const value = item.column_values[column.id] || "";

  return (
    <div className={`${column.width ? '' : 'w-32'} border-r border-gray-200 dark:border-slate-700 flex items-center justify-center text-xs text-gray-600 dark:text-gray-300 shrink-0`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <input
        type="date"
        value={value}
        onChange={(e) => onUpdate(item.id, column.id, e.target.value)}
        className="outline-none bg-transparent w-full text-center cursor-pointer text-xs text-gray-600 dark:text-gray-300 [color-scheme:light] dark:[color-scheme:dark]"
      />
    </div>
  );
}
