"use client";

import React, { useState } from "react";
import { Item, Column } from "@/types";
import { Tag } from "lucide-react";

interface TagsCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function TagsCell({ item, column, onUpdate }: TagsCellProps) {
  // Tags stored as string[]
  const tags: string[] = Array.isArray(item.column_values?.[column.id]) 
    ? item.column_values[column.id] 
    : [];

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(tags.join(", "));

  const handleSave = () => {
    setIsEditing(false);
    // split by comma, trim, remove empty
    const newTags = inputValue.split(",").map(t => t.trim()).filter(t => t !== "");
    onUpdate(item.id, column.id, newTags);
  };

  // Generate consistent color based on string
  const getTagColor = (tag: string) => {
    const colors = [
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    ];
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  if (isEditing) {
    return (
      <div className="w-48 border-r border-gray-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900 flex items-center p-1 relative z-10">
        <input
          autoFocus
          type="text"
          value={inputValue}
          placeholder="tag1, tag2..."
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          className="w-full h-full text-sm outline-none px-2 bg-white dark:bg-slate-800 border border-blue-500 rounded shadow-sm"
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="w-48 border-r border-gray-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900 flex items-center p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors overflow-hidden"
    >
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 items-center">
          <Tag size={12} className="text-gray-400 mr-1" />
          {tags.map((tag, idx) => (
            <span key={idx} className={`text-[10px] font-medium px-2 py-0.5 rounded-sm truncate max-w-[80px] ${getTagColor(tag)}`}>
              #{tag}
            </span>
          ))}
        </div>
      ) : (
        <div className="w-full text-center text-gray-400 dark:text-gray-500 text-xl pb-1 opacity-0 hover:opacity-100 transition-opacity">
          +
        </div>
      )}
    </div>
  );
}
