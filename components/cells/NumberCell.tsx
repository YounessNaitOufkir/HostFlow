"use client";

import React, { useState, useEffect } from "react";
import { Item, Column } from "@/types";
import { useLanguage } from "@/components/LanguageProvider";
import { formatColumnNumber } from "@/lib/numberFormat";

interface NumberCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function NumberCell({ item, column, onUpdate }: NumberCellProps) {
  const { bcp47 } = useLanguage();
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
    return formatColumnNumber(num, column, bcp47);
  })();

  return (
    <div className={`${column.width ? '' : 'w-32'} border-r border-gray-200 dark:border-slate-700 flex items-center justify-center px-2 shrink-0`} style={{ width: column.width ? `${column.width}px` : undefined }}>
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
        className="outline-none bg-transparent w-full text-sm text-gray-700 dark:text-gray-200 text-center number-input placeholder-gray-400 dark:placeholder-gray-600"
      />
    </div>
  );
}
