"use client";

import React, { useState, useRef, useEffect } from "react";
import { Item, Column } from "@/types";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { motion, AnimatePresence } from "framer-motion";

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

  const currentOptions = column.settings?.priorityLabels || PRIORITY_OPTIONS;
  const currentOption = currentOptions.find((o: any) => o.label === value) || currentOptions[currentOptions.length - 1];

  return (
    <div className={`${column.width ? '' : 'w-36'} border-r border-gray-200 dark:border-slate-700 shrink-0 relative ${isOpen ? "z-50" : ""}`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <div
        className={`w-full h-full flex items-center justify-center text-white text-sm cursor-pointer border border-transparent hover:border-gray-300 dark:hover:border-slate-500 transition-colors ${currentOption.color}`}
        onClick={(e) => {
          e.stopPropagation();
          if (setActiveStatusId) setActiveStatusId(isOpen ? null : cellKey);
        }}
      >
        <span className="flex items-center">
          {value === "Empty" ? "" : value}
          {(value === "Critical" || value === "Critique") && <span className="ml-1.5 text-[11px] leading-none">⚠️</span>}
        </span>
        
        {/* Fold indicator */}
        <div className="absolute top-0 right-0 w-3 h-3 bg-white/20" style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}></div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            ref={dropdownRef}
            className={`absolute ${dropdownDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} w-[140px] dropdown-menu z-50 flex flex-col bg-white dark:bg-slate-900 shadow-2xl rounded overflow-hidden border border-gray-200 dark:border-slate-700`}
          >
            {currentOptions.map((opt: any) => (
              <button
                key={opt.label}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(opt.label);
                }}
                className={`w-full text-left px-3 py-2 text-[13px] text-white transition-colors ${opt.color} hover:opacity-90 flex items-center justify-between`}
              >
                <TruncatedText className="truncate">{opt.label === "Empty" ? "" : (opt.label || "\u00A0")}</TruncatedText>
                {(opt.label === "Critical" || opt.label === "Critique") && <span className="text-[11px] ml-1 shrink-0">⚠️</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
