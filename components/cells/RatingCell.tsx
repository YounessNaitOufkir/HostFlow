"use client";

import React from "react";
import { Item, Column } from "@/types";
import { Star } from "lucide-react";

interface RatingCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function RatingCell({ item, column, onUpdate }: RatingCellProps) {
  const maxStars = column.settings?.ratingMax || 5;
  const value = Number(item.column_values?.[column.id]) || 0;

  const handleClick = (e: React.MouseEvent, starIndex: number) => {
    e.stopPropagation();
    // Clicking the same star again clears the rating
    const newValue = starIndex === value ? 0 : starIndex;
    onUpdate(item.id, column.id, newValue);
  };

  return (
    <div className={`${column.width ? '' : 'w-32'} border-r border-gray-200 dark:border-slate-700 shrink-0 flex items-center justify-center gap-0.5 px-1`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      {Array.from({ length: maxStars }, (_, i) => {
        const starNum = i + 1;
        const isFilled = starNum <= value;
        return (
          <button
            key={starNum}
            onClick={(e) => handleClick(e, starNum)}
            className={`p-0.5 transition-colors ${
              isFilled
                ? "text-amber-400 hover:text-amber-500"
                : "text-gray-300 dark:text-gray-600 hover:text-amber-300 dark:hover:text-amber-500"
            }`}
          >
            <Star size={14} fill={isFilled ? "currentColor" : "none"} />
          </button>
        );
      })}
    </div>
  );
}
