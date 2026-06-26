"use client";

import React, { useState, useEffect } from "react";
import { Item, Column } from "@/types";

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

  return (
    <div className="w-48 border-r border-gray-200 flex items-center px-2 shrink-0">
      <input
        type="text"
        placeholder="Add text..."
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => onUpdate(item.id, column.id, localValue)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="outline-none bg-transparent w-full text-sm text-gray-700"
      />
    </div>
  );
}
