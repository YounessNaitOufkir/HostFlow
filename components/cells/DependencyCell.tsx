"use client";

import React, { useState, useRef, useEffect } from "react";
import { Item, Column } from "@/types";
import { Link2 } from "lucide-react";

interface DependencyCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  boardItems: Item[];
}

export default function DependencyCell({ item, column, onUpdate, boardItems }: DependencyCellProps) {
  // Value is an array of dependent Item IDs
  const value: string[] = Array.isArray(item.column_values?.[column.id])
    ? item.column_values[column.id]
    : [];

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const toggleDependency = (targetItemId: string) => {
    const newDeps = value.includes(targetItemId)
      ? value.filter((id) => id !== targetItemId)
      : [...value, targetItemId];
    onUpdate(item.id, column.id, newDeps);
  };

  const dependentItems = boardItems.filter((i) => value.includes(i.id));

  return (
    <div className="w-48 border-r border-gray-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900 relative flex items-center p-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
      <div
        className="w-full h-full flex items-center overflow-hidden"
        onClick={() => setIsOpen(!isOpen)}
      >
        {dependentItems.length > 0 ? (
          <div className="flex flex-wrap gap-1 items-center">
            <Link2 size={12} className="text-blue-500 mr-1 shrink-0" />
            {dependentItems.map((dep) => (
              <span
                key={dep.id}
                className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium px-2 py-0.5 rounded-sm truncate max-w-[80px]"
              >
                {dep.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="w-full text-center text-gray-400 dark:text-gray-500 text-xl pb-1 opacity-0 hover:opacity-100 transition-opacity">
            +
          </div>
        )}
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-10 left-0 w-64 bg-white dark:bg-slate-900 shadow-xl rounded-lg border border-gray-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-60 overflow-y-auto"
        >
          <div className="px-3 pb-2 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
            Select items to depend on
          </div>
          {boardItems
            .filter((i) => i.id !== item.id) // Can't depend on itself
            .map((otherItem) => {
              const isSelected = value.includes(otherItem.id);
              return (
                <div
                  key={otherItem.id}
                  onClick={() => toggleDependency(otherItem.id)}
                  className={`px-3 py-2 text-sm cursor-pointer flex items-center transition-colors hover:bg-gray-50 dark:hover:bg-slate-800`}
                >
                  <div
                    className={`w-4 h-4 rounded-sm mr-3 border flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600"
                    }`}
                  >
                    {isSelected && <span className="text-[10px]">✓</span>}
                  </div>
                  <span className="text-gray-700 dark:text-gray-200 truncate">
                    {otherItem.name}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
