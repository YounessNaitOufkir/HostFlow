"use client";

import React, { useState, useRef, useEffect } from "react";
import { Item, Column } from "@/types";
import { Link2, AlertCircle, X, CalendarClock } from "lucide-react";
import { useBoardStore } from "@/hooks/useBoardStore";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

interface DependencyCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  boardItems: Item[];
  columns?: Column[];
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
}

export default function DependencyCell({ item, column, onUpdate, boardItems, columns = [], activeStatusId, setActiveStatusId }: DependencyCellProps) {
  // Value is an array of dependent Item IDs
  const value: string[] = Array.isArray(item.column_values?.[column.id])
    ? item.column_values[column.id]
    : [];

  const isOpen = activeStatusId === item.id + column.id;
  
  const setIsOpen = (open: boolean) => {
    if (setActiveStatusId) {
      setActiveStatusId(open ? item.id + column.id : null);
    }
  };

  const dropdownRef = useRef<HTMLDivElement>(null);

  const [conflictTarget, setConflictTarget] = useState<Item | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setConflictTarget(null); // Clear error when closed
      setSearchQuery(""); // Clear search
      return;
    }
    
    if (inputRef.current) {
      inputRef.current.focus();
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Find primary date column for conflict checking
  const dateCol = columns?.find((c) => c.type === "date" || c.type === "timeline");

  const getItemDates = (i: Item) => {
    if (!dateCol) return null;
    const val = i.column_values?.[dateCol.id];
    if (!val) return null;
    if (dateCol.type === "date") return { start: new Date(val), end: new Date(val) };
    if (dateCol.type === "timeline" && val.start && val.end) {
      return { start: new Date(val.start), end: new Date(val.end) };
    }
    return null;
  };

  const myDates = getItemDates(item);

  const toggleDependency = async (targetItemId: string) => {
    const isRemoving = value.includes(targetItemId);
    
    if (!isRemoving) {
      const targetItem = boardItems.find(i => i.id === targetItemId);
      if (targetItem) {
        const depDates = getItemDates(targetItem);
        
        // If I depend on dep, dep must finish BEFORE my start date.
        // Even finishing on the same day is a conflict, because I can only start the next day.
        if (myDates && depDates && depDates.end >= myDates.start) {
          setConflictTarget(targetItem);
          return; // Stop the user
        }
      }
    }

    setConflictTarget(null);
    const newDeps = isRemoving
      ? value.filter((id) => id !== targetItemId)
      : [...value, targetItemId];
      
    // Execute DB operations in background without blocking UI update
    if (isRemoving) {
      supabase.from("item_links")
        .delete()
        .eq("source_item_id", targetItemId)
        .eq("target_item_id", item.id)
        .eq("link_type", "dependency")
        .then();
    } else {
      supabase.from("item_links")
        .insert({
          source_item_id: targetItemId,
          target_item_id: item.id,
          link_type: "dependency"
        })
        .then();
    }
      
    onUpdate(item.id, column.id, newDeps);
    if (!isRemoving) {
      setSearchQuery("");
    }
  };

  const handleAdjustDates = () => {
    if (!conflictTarget || !dateCol || !myDates) return;
    
    const depDates = getItemDates(conflictTarget);
    if (!depDates) return;

    // Calculate shift in days to push my start date to the day AFTER the parent's end date
    const shiftMs = depDates.end.getTime() - myDates.start.getTime();
    const shiftDays = Math.round(shiftMs / (1000 * 60 * 60 * 24)) + 1;

    let newVal;
    const addDays = (date: Date, days: number) => {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    if (dateCol.type === "date") {
      newVal = addDays(myDates.start, shiftDays);
    } else if (dateCol.type === "timeline") {
      newVal = {
        start: addDays(myDates.start, shiftDays),
        end: addDays(myDates.end, shiftDays)
      };
    }

    // 1. Update the date column to the new shifted dates
    onUpdate(item.id, dateCol.id, newVal);

    // 2. Create the dependency link
    const newDeps = [...value, conflictTarget.id];
    supabase.from("item_links")
      .insert({
        source_item_id: conflictTarget.id,
        target_item_id: item.id,
        link_type: "dependency"
      })
      .then();
      
    onUpdate(item.id, column.id, newDeps);
    setConflictTarget(null);
  };


  const dependentItems = boardItems
    .filter((i) => value.includes(i.id))
    .map(dep => {
      const depDates = getItemDates(dep);
      // If I depend on dep, dep must finish BEFORE my start date.
      // So if dep's end date is >= my start date, it's a conflict!
      const hasConflict = myDates && depDates && depDates.end >= myDates.start;
      return { ...dep, hasConflict };
    });

  const availableItems = boardItems
    .filter((i) => i.id !== item.id) // Can't depend on itself
    .filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className={`${column.width ? '' : 'w-48'} border-r border-gray-200 dark:border-slate-700 shrink-0 relative flex items-center p-1.5 cursor-pointer transition-colors ${isOpen ? "z-50" : ""}`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <div
        className="w-full h-full flex items-center overflow-x-auto overflow-y-hidden no-scrollbar"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        {dependentItems.length > 0 ? (
          <div className="flex gap-1.5 items-center px-1">
            {dependentItems.map((dep) => (
              <span
                key={dep.id}
                title={dep.hasConflict ? "Date Conflict! This item ends after your start date." : dep.name}
                className={`text-[13px] px-2.5 py-0.5 rounded-[4px] truncate max-w-[140px] shrink-0 ${
                  dep.hasConflict 
                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 ring-1 ring-red-500" 
                    : "bg-[#cce5ff] text-[#323338] dark:bg-[#cce5ff]/20 dark:text-[#cce5ff]"
                }`}
              >
                {dep.hasConflict && "⚠️ "}{dep.name}
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
          className="absolute top-full mt-1 left-0 w-72 dropdown-menu py-1.5 z-50 shadow-xl border border-gray-100 dark:border-slate-700/60 rounded-lg overflow-hidden bg-white dark:bg-[#1e2333]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 pb-2 mb-1 border-b border-gray-100 dark:border-slate-800">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items to depend on..."
              className="w-full px-2 py-1.5 text-sm border border-blue-400 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-800 dark:text-white"
            />
          </div>
          
          <div className="max-h-60 overflow-y-auto px-1 py-1">
            {availableItems.map((otherItem) => {
              const isSelected = value.includes(otherItem.id);
              return (
                <div
                  key={otherItem.id}
                  onClick={() => toggleDependency(otherItem.id)}
                  className={`px-3 py-2 text-sm cursor-pointer flex items-center transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md group`}
                >
                  <div
                    className={`w-4 h-4 rounded-sm mr-3 border flex items-center justify-center shrink-0 transition-colors ${
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
            
            {availableItems.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-gray-400">
                No items found
              </div>
            )}
          </div>
        </div>
      )}
      {isMounted && document.body && createPortal(
        <>
          {conflictTarget && (
            <div key="conflict-modal" className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-0">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setConflictTarget(null)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0.4, duration: 0.5 }}
                className="relative w-full max-w-md bg-white dark:bg-[#1e2333] rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700/50"
              >
                <div className="p-6">
                  <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                    <CalendarClock className="text-amber-600 dark:text-amber-400 w-6 h-6" />
                  </div>
                  
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Timeline Conflict
                  </h3>
                  
                  <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-6">
                    Whoops! It looks like <span className="font-semibold text-gray-900 dark:text-gray-100">"{conflictTarget.name}"</span> finishes after this task begins. 
                    Tasks must be scheduled chronologically to create a dependency. Please adjust the dates before linking them!
                  </p>
                  
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setConflictTarget(null)}
                      className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors shadow-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAdjustDates}
                      className="px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      Adjust Dates
                    </button>
                  </div>
                </div>
                
                {/* Close button top right */}
                <button
                  onClick={() => setConflictTarget(null)}
                  className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  );
}
