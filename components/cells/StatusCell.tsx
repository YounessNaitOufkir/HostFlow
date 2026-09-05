"use client";

import React, { useRef, useState, useEffect } from "react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { Item, Column, STATUS_OPTIONS } from "@/types";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { useT } from "@/components/LanguageProvider";
import { displayStatus } from "@/lib/i18n/labels";
import { Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface StatusCellProps {
  item: Item;
  column: Column;
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function StatusCell({
  item,
  column,
  activeStatusId,
  setActiveStatusId,
  onUpdate,
}: StatusCellProps) {
  const t = useT();
  const value = item.column_values[column.id];
  const cellKey = `${item.id}-${column.id}`;
  const isOverdue = value === "Overdue" || value === "En retard";
  const currentOptions = column.settings?.statusLabels || STATUS_OPTIONS;
  const option = currentOptions.find((opt: any) => opt.label === value);
  const bgColor = option ? option.color : (isOverdue ? "bg-gradient-to-r from-red-600 to-rose-600" : "bg-[#c4c4c4]");

  const isOpen = activeStatusId === cellKey;
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(isOpen, { align: 'left' });
  // Kept true through the exit animation so the popup keeps its stacking
  // priority (z-50) until it has actually faded out — otherwise it gets
  // clipped behind the next row the instant `isOpen` flips to false.
  const [isElevated, setIsElevated] = useState(false);
  useEffect(() => {
    if (isOpen) setIsElevated(true);
  }, [isOpen]);

  const handleToggle = () => {
    setActiveStatusId?.(isOpen ? null : cellKey);
  };

  return (
    <div className={`${column.width ? '' : 'w-32'} border-r border-gray-200 dark:border-slate-700 relative shrink-0 ${isElevated ? "z-50" : ""}`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <div
        ref={anchorRef}
        onClick={(e) => {
          e.stopPropagation();
          handleToggle();
        }}
        className={`relative cursor-pointer w-full h-full flex items-center justify-center text-white text-[13px] hover:opacity-90 transition-all ${bgColor} ${
          isOverdue ? "shadow-sm border border-red-500/40 dark:border-red-400/50" : "border border-transparent hover:border-gray-300 dark:hover:border-slate-500"
        }`}
      >
        {isOverdue && (
          <Clock size={11} className="absolute top-1 right-3 animate-pulse stroke-[2.5] drop-shadow-sm" />
        )}
        <TruncatedText className="truncate px-2">{value === "Empty" ? "" : displayStatus(t, value as string)}</TruncatedText>

        {/* Fold indicator */}
        <div className="absolute top-0 right-0 w-3 h-3 bg-white/20" style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}></div>
      </div>

      <AnimatePresence onExitComplete={() => setIsElevated(false)}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            ref={menuRef}
            style={menuStyle}
            className="w-[140px] dropdown-menu z-[60] flex flex-col bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl rounded overflow-hidden"
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
                <TruncatedText className="truncate">{opt.label === "Empty" ? "" : (displayStatus(t, opt.label) || "\u00A0")}</TruncatedText>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
