"use client";

import React, { useState, useEffect } from "react";
import { Item, Column } from "@/types";
import { useTruncationTooltip } from "@/components/ui/TruncatedText";

interface TextCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function TextCell({ item, column, onUpdate }: TextCellProps) {
  const [localValue, setLocalValue] = useState(item.column_values[column.id] || "");

  // Sync with external changes (e.g. realtime updates from other tabs)
  useEffect(() => {
    setLocalValue(item.column_values[column.id] || "");
  }, [item.column_values[column.id]]);

  // An input clips its overflow without an ellipsis, so long values are just as
  // unreadable as truncated text. Reveal them on hover, but not while editing.
  const { ref, tooltip, handlers } = useTruncationTooltip<HTMLInputElement>(localValue);

  return (
    <div className={`${column.width ? '' : 'w-48'} border-r border-gray-200 dark:border-slate-700 flex items-center px-2 shrink-0`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <input
        ref={ref}
        type="text"
        placeholder="Add text..."
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onMouseEnter={handlers.onMouseEnter}
        onMouseLeave={handlers.onMouseLeave}
        onBlur={() => {
          handlers.onBlur();
          onUpdate(item.id, column.id, localValue);
        }}
        onFocus={handlers.onMouseLeave}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="outline-none bg-transparent w-full text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
      />
      {tooltip}
    </div>
  );
}
