"use client";

import React from "react";
import { Item, Column, STATUS_OPTIONS } from "@/types";

interface StatusCellProps {
  item: Item;
  column: Column;
  activeStatusId: string | null;
  setActiveStatusId: (id: string | null) => void;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function StatusCell({
  item,
  column,
  activeStatusId,
  setActiveStatusId,
  onUpdate,
}: StatusCellProps) {
  const value = item.column_values[column.id];
  const cellKey = `${item.id}-${column.id}`;
  const option = STATUS_OPTIONS.find((opt) => opt.label === value);
  const bgColor = option ? option.color : "bg-[#c4c4c4]";

  return (
    <div className="w-32 border-r border-gray-200 p-[2px] relative flex items-center justify-center shrink-0">
      <div
        onClick={(e) => {
          e.stopPropagation();
          setActiveStatusId(activeStatusId === cellKey ? null : cellKey);
        }}
        className={`cursor-pointer w-full h-full flex items-center justify-center text-white text-xs font-medium rounded-sm hover:opacity-85 transition-opacity ${bgColor}`}
      >
        {value || "Empty"}
      </div>

      {activeStatusId === cellKey && (
        <div className="absolute top-10 w-[140px] bg-white shadow-xl rounded-md border border-gray-200 p-2 z-50 flex flex-col space-y-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={(e) => {
                e.stopPropagation();
                onUpdate(item.id, column.id, opt.label);
              }}
              className={`${opt.color} text-white text-xs font-medium py-2 px-3 rounded-sm text-center hover:opacity-90 transition-transform`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
