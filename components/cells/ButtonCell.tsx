"use client";

import React, { useState } from "react";
import { Item, Column } from "@/types";
import { motion, AnimatePresence } from "framer-motion";

interface ButtonCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function ButtonCell({ item, column, onUpdate }: ButtonCellProps) {
  const [isClicked, setIsClicked] = useState(false);
  const text = item.column_values[column.id] || "Click when done";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsClicked(true);
    // Could trigger an integration/webhook here
    setTimeout(() => setIsClicked(false), 2000);
  };

  return (
    <div className={`${column.width ? '' : 'w-48'} border-r border-gray-200 dark:border-slate-700 flex items-center justify-center px-2 shrink-0 relative`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <button
        onClick={handleClick}
        className="w-full mx-2 py-1.5 px-3 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[13px] font-medium rounded transition-colors overflow-hidden relative"
      >
        <AnimatePresence mode="wait">
          {isClicked ? (
            <motion.span
              key="clicked"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="block text-green-600 dark:text-green-400"
            >
              Done!
            </motion.span>
          ) : (
            <motion.span
              key="default"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="block truncate"
            >
              {text}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
