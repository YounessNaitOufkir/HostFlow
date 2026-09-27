"use client";

import React, { useState, useEffect, useRef } from "react";
import { Item, Column } from "@/types";
import { useTruncationTooltip } from "@/components/ui/TruncatedText";

interface TextCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function TextCell({ item, column, onUpdate }: TextCellProps) {
  const [localValue, setLocalValue] = useState(item.column_values[column.id] || "");
  const [isFocused, setIsFocused] = useState(false);
  // The text when the cell was entered. Leaving without changing it saves
  // nothing, so a colleague's edit that arrived meanwhile is not put back.
  const valueOnFocus = useRef("");

  // Sync with external changes (a colleague's edit, another tab) - but never
  // while typing here, which would throw away what is being typed. Leaving the
  // cell saves this text over theirs, as the last edit made.
  useEffect(() => {
    if (!isFocused) setLocalValue(item.column_values[column.id] || "");
  }, [item.column_values[column.id], isFocused]);

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
          setIsFocused(false);
          handlers.onBlur();
          if (localValue !== valueOnFocus.current) onUpdate(item.id, column.id, localValue);
        }}
        onFocus={() => {
          valueOnFocus.current = localValue;
          setIsFocused(true);
          handlers.onMouseLeave();
        }}
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
