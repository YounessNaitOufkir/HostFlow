"use client";

import React, { useState, useEffect } from "react";
import { Item, Column } from "@/types";

interface NumberCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function NumberCell({ item, column, onUpdate }: NumberCellProps) {
  const rawValue = item.column_values[column.id];
  const [localValue, setLocalValue] = useState(rawValue ?? "");
  const [isFocused, setIsFocused] = useState(false);

  // Sync with external changes (realtime updates)
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(rawValue ?? "");
    }
  }, [rawValue, isFocused]);

  // Format number for display (with commas) when not focused
  const displayValue = (() => {
    if (isFocused) return localValue;
    const num = parseFloat(String(localValue));
    if (isNaN(num) || localValue === "") return "";
    return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  })();

  return (
    <div className="w-32 border-r border-gray-200 flex items-center justify-center px-2 shrink-0">
      <input
        type="text"
        inputMode="numeric"
        placeholder="—"
        value={isFocused ? localValue : displayValue}
        onFocus={() => setIsFocused(true)}
        onChange={(e) => {
          // Allow numbers, decimals, negatives, and empty
          const v = e.target.value;
          if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) {
            setLocalValue(v);
          }
        }}
        onBlur={() => {
          setIsFocused(false);
          onUpdate(item.id, column.id, localValue);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="outline-none bg-transparent w-full text-sm text-gray-700 text-center number-input"
      />
    </div>
  );
}
