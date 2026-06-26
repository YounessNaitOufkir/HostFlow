"use client";

import React, { useState, useRef, useEffect } from "react";
import { Item, Column } from "@/types";

interface PriorityCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

const PRIORITY_OPTIONS = [
  { label: "Critical", color: "bg-gray-900 dark:bg-black text-white" },
  { label: "High", color: "bg-[#e2445c] text-white" },
  { label: "Medium", color: "bg-[#a25ddc] text-white" },
  { label: "Low", color: "bg-[#579bfc] text-white" },
  { label: "Empty", color: "bg-[#c4c4c4] text-white" },
];

export default function PriorityCell({ item, column, onUpdate }: PriorityCellProps) {
  const value = item.column_values?.[column.id] || "Empty";
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

  const handleSelect = (label: string) => {
    onUpdate(item.id, column.id, label);
    setIsOpen(false);
  };

  const currentOption = PRIORITY_OPTIONS.find((o) => o.label === value) || PRIORITY_OPTIONS[4];

  return (
    <div className="w-36 border-r border-gray-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900 relative">
      <div
        className={`w-full h-full flex items-center justify-center text-sm cursor-pointer border border-transparent hover:border-gray-300 dark:hover:border-slate-500 transition-colors ${currentOption.color}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {value === "Empty" ? "" : value}
        
        {/* Fold indicator */}
        <div className="absolute top-0 right-0 w-3 h-3 bg-white/20" style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}></div>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-10 left-1/2 -translate-x-1/2 w-40 bg-white dark:bg-slate-900 shadow-xl rounded-lg border border-gray-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <div
              key={opt.label}
              onClick={() => handleSelect(opt.label)}
              className={`px-4 py-2 text-sm cursor-pointer flex items-center group transition-colors hover:bg-gray-50 dark:hover:bg-slate-800`}
            >
              <div className={`w-4 h-4 rounded-sm mr-3 ${opt.color}`}></div>
              <span className="text-gray-700 dark:text-gray-200 group-hover:font-medium">
                {opt.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
