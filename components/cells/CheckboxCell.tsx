"use client";

import React from "react";
import { Item, Column } from "@/types";
import { CheckSquare, Square } from "lucide-react";

interface CheckboxCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function CheckboxCell({ item, column, onUpdate }: CheckboxCellProps) {
  const value = Boolean(item.column_values?.[column.id]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(item.id, column.id, !value);
  };

  return (
    <div className={`${column.width ? '' : 'w-24'} border-r border-gray-200 dark:border-slate-700 shrink-0 flex items-center justify-center`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <button
        onClick={toggle}
        className={`p-1 rounded transition-all ${
          value
            ? "text-green-500 hover:text-green-600"
            : "text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500"
        }`}
      >
        {value ? <CheckSquare size={18} /> : <Square size={18} />}
      </button>
    </div>
  );
}
