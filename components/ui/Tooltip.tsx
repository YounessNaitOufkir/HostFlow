"use client";

import React, { useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface TooltipProps {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
  children: React.ReactElement;
  className?: string;
  disabled?: boolean;
}

export function Tooltip({
  content,
  side = "top",
  delay = 50,
  children,
  className = "",
  disabled = false,
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(false);
  };

  const positionStyles: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const animationVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
  };

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      <AnimatePresence>
        {isOpen && !disabled && content && (
          <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={animationVariants}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className={`absolute z-[100] px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900/95 dark:bg-slate-800 rounded-md shadow-lg border border-slate-700/60 pointer-events-none whitespace-nowrap ${positionStyles[side]} ${className}`}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Tooltip;
