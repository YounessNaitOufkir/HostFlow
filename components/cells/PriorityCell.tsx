"use client";

import React, { useState, useRef, useEffect } from "react";
import { Item, Column } from "@/types";

interface PriorityCellProps {
  item: Item;
  column: Column;
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  dropdownDirection?: "up" | "down";
}

const PRIORITY_OPTIONS = [
  { label: "Critical", color: "bg-gray-900 dark:bg-black text-white" },
  { label: "High", color: "bg-[#e2445c] text-white" },
  { label: "Medium", color: "bg-[#a25ddc] text-white" },
  { label: "Low", color: "bg-[#579bfc] text-white" },
  { label: "Empty", color: "bg-[#c4c4c4] text-white" },
];

export default function PriorityCell({ item, column, activeStatusId, setActiveStatusId, onUpdate, dropdownDirection = "down" }: PriorityCellProps) {
  const value = item.column_values?.[column.id] || "Empty";
  const cellKey = `${item.id}-${column.id}`;
  const isOpen = activeStatusId === cellKey;
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !setActiveStatusId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveStatusId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, setActiveStatusId]);

  const handleSelect = (label: string) => {
    onUpdate(item.id, column.id, label);
    if (setActiveStatusId) setActiveStatusId(null);
  };

  const currentOption = PRIORITY_OPTIONS.find((o) => o.label === value) || PRIORITY_OPTIONS[4];

  return (
    <div className={`${column.width ? '' : 'w-36'} border-r border-gray-200 dark:border-slate-700 shrink-0 relative ${isOpen ? "z-50" : ""}`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <div
        className={`w-full h-full flex items-center justify-center text-sm cursor-pointer border border-transparent hover:border-gray-300 dark:hover:border-slate-500 transition-colors ${currentOption.color}`}
        onClick={(e) => {
          e.stopPropagation();
          if (setActiveStatusId) setActiveStatusId(isOpen ? null : cellKey);
        }}
      >
        <span className="flex items-center">
          {value === "Empty" ? "" : value}
          {value === "Critical" && <span className="ml-1.5 text-[11px] leading-none">⚠️</span>}
        </span>
        
        {/* Fold indicator */}
        <div className="absolute top-0 right-0 w-3 h-3 bg-white/20" style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}></div>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`absolute ${dropdownDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} left-1/2 -translate-x-1/2 w-40 dropdown-menu py-1.5 z-50 flex flex-col`}
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <div
              key={opt.label}
              onClick={() => handleSelect(opt.label)}
              className={`px-4 py-2 text-sm cursor-pointer flex items-center group transition-colors hover:bg-gray-50 dark:hover:bg-slate-800`}
            >
              <div className={`w-4 h-4 rounded-sm mr-3 ${opt.color}`}></div>
              <span className="text-gray-700 dark:text-gray-200 group-hover:font-medium flex items-center">
                {opt.label}
                {opt.label === "Critical" && <span className="ml-1.5 text-[11px] leading-none">⚠️</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
