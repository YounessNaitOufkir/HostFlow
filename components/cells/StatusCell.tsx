"use client";

import React from "react";
import { Item, Column, STATUS_OPTIONS } from "@/types";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface StatusCellProps {
  item: Item;
  column: Column;
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  dropdownDirection?: "up" | "down";
}

export default function StatusCell({
  item,
  column,
  activeStatusId,
  setActiveStatusId,
  onUpdate,
  dropdownDirection = "down",
}: StatusCellProps) {
  const value = item.column_values[column.id];
  const cellKey = `${item.id}-${column.id}`;
  const isOverdue = value === "Overdue" || value === "En retard";
  const currentOptions = column.settings?.statusLabels || STATUS_OPTIONS;
  const option = currentOptions.find((opt: any) => opt.label === value);
  const bgColor = option ? option.color : (isOverdue ? "bg-gradient-to-r from-red-600 to-rose-600" : "bg-[#c4c4c4]");

  return (
    <div className={`${column.width ? '' : 'w-32'} border-r border-gray-200 dark:border-slate-700 relative shrink-0 ${activeStatusId === cellKey ? "z-50" : ""}`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          setActiveStatusId?.(activeStatusId === cellKey ? null : cellKey);
        }}
        className={`relative cursor-pointer w-full h-full flex items-center justify-center text-white text-[13px] hover:opacity-90 transition-all ${bgColor} ${
          isOverdue ? "shadow-sm border border-red-500/40 dark:border-red-400/50" : "border border-transparent hover:border-gray-300 dark:hover:border-slate-500"
        }`}
      >
        {isOverdue && (
          <Clock size={11} className="absolute top-1 right-3 animate-pulse stroke-[2.5] drop-shadow-sm" />
        )}
        <TruncatedText className="truncate px-2">{value === "Empty" ? "" : (value || "")}</TruncatedText>
        
        {/* Fold indicator */}
        <div className="absolute top-0 right-0 w-3 h-3 bg-white/20" style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}></div>
      </div>

      <AnimatePresence>
        {activeStatusId === cellKey && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`absolute ${dropdownDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} w-[140px] dropdown-menu z-50 flex flex-col bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl rounded overflow-hidden`}
          >
            {currentOptions.map((opt) => (
              <button
                key={opt.label}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(item.id, column.id, opt.label);
                  setActiveStatusId?.(null);
                }}
                className={`w-full text-left px-3 py-2 text-[13px] text-white transition-colors ${opt.color} hover:opacity-90 flex items-center justify-between`}
              >
                <TruncatedText className="truncate">{opt.label === "Empty" ? "" : (opt.label || "\u00A0")}</TruncatedText>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
