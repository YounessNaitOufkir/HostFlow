"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { Item, Column } from "@/types";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { useT } from "@/components/LanguageProvider";
import { displayPriority } from "@/lib/i18n/labels";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

interface PriorityCellProps {
  item: Item;
  column: Column;
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

const PRIORITY_OPTIONS = [
  { label: "Critical", color: "bg-gray-900 dark:bg-black text-white" },
  { label: "High", color: "bg-[#e2445c] text-white" },
  { label: "Medium", color: "bg-[#a25ddc] text-white" },
  { label: "Low", color: "bg-[#579bfc] text-white" },
  { label: "Empty", color: "bg-[#c4c4c4] dark:bg-[#3e4157] text-white" },
];

export default function PriorityCell({ item, column, activeStatusId, setActiveStatusId, onUpdate }: PriorityCellProps) {
  const t = useT();
  const value = item.column_values?.[column.id] || "Empty";
  const cellKey = `${item.id}-${column.id}`;
  const isOpen = activeStatusId === cellKey;
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(isOpen, { align: 'left' });
  // Kept true through the exit animation so the popup keeps its stacking
  // priority (z-50) until it has actually faded out — otherwise it gets
  // clipped behind the next row the instant `isOpen` flips to false.
  const [isElevated, setIsElevated] = useState(false);
  useEffect(() => {
    if (isOpen) setIsElevated(true);
  }, [isOpen]);

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
  const isEmpty = value === "Empty";

  const handleToggle = () => {
    if (setActiveStatusId) setActiveStatusId(isOpen ? null : cellKey);
  };

  return (
    <div
      ref={anchorRef}
      className={`${column.width ? '' : 'w-36'} border-r border-gray-200 dark:border-slate-700 shrink-0 relative ${isElevated ? "z-50" : ""}`}
      style={{ width: column.width ? `${column.width}px` : undefined }}
    >
      {/* Was a div. useAnchoredMenu's ref is typed for a div, so it stays on
          the wrapper above (same bounding box) and this button carries none. */}
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={`w-full h-full flex items-center justify-center text-white text-sm cursor-pointer transition-colors text-left ${
          isEmpty
            ? "bg-transparent border border-dashed border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-500"
            : `border border-transparent hover:border-gray-300 dark:hover:border-slate-500 ${currentOption.color}`
        }`}
        onClick={(e) => {
          e.stopPropagation();
          handleToggle();
        }}
      >
        <span className="flex items-center">
          {value === "Empty" ? "" : displayPriority(t, value as string)}
          {(value === "Critical" || value === "Critique") && <AlertTriangle size={13} strokeWidth={2.25} className="ml-1.5 shrink-0 text-amber-400" aria-hidden />}
        </span>

        {/* Fold indicator */}
        {!isEmpty && (
          <div className="absolute top-0 right-0 w-3 h-3 bg-white/20" style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}></div>
        )}
      </button>

      <AnimatePresence onExitComplete={() => setIsElevated(false)}>
        {isOpen && (
          <motion.div
            key="priority-menu"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            ref={(el) => { dropdownRef.current = el; menuRef.current = el; }}
            style={menuStyle}
            className="w-[140px] dropdown-menu z-[60] flex flex-col bg-white dark:bg-slate-900 shadow-2xl rounded overflow-hidden border border-gray-200 dark:border-slate-700"
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
                <TruncatedText className="truncate">{opt.label === "Empty" ? "" : (displayPriority(t, opt.label) || "\u00A0")}</TruncatedText>
                {(opt.label === "Critical" || opt.label === "Critique") && <AlertTriangle size={13} strokeWidth={2.25} className="ml-1 shrink-0 text-amber-400" aria-hidden />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
