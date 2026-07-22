"use client";

import React, { createContext, useContext, useState } from "react";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { motion } from "framer-motion";
import NumberFlow from "@number-flow/react";

export interface RingData {
  label: string;
  value: number;
  maxValue: number;
  color?: string;
}

interface RingChartContextType {
  data: RingData[];
  size: number;
  strokeWidth: number;
  ringGap: number;
  baseInnerRadius: number;
  hoveredIndex: number | null;
  setHoveredIndex: (index: number | null) => void;
  centerX: number;
  centerY: number;
}

const RingChartContext = createContext<RingChartContextType | null>(null);

export function useRingChart() {
  const context = useContext(RingChartContext);
  if (!context) throw new Error("useRingChart must be used within RingChart");
  return context;
}

interface RingChartProps {
  data: RingData[];
  size?: number;
  strokeWidth?: number;
  ringGap?: number;
  baseInnerRadius?: number;
  hoveredIndex?: number | null;
  onHoverChange?: (index: number | null) => void;
  className?: string;
  children?: React.ReactNode;
}

export function RingChart({
  data,
  size,
  strokeWidth = 12,
  ringGap = 6,
  baseInnerRadius = 50,
  hoveredIndex: controlledHoveredIndex,
  onHoverChange,
  className = "",
  children,
}: RingChartProps) {
  const [internalHoveredIndex, setInternalHoveredIndex] = useState<number | null>(null);
  const hoveredIndex = controlledHoveredIndex !== undefined ? controlledHoveredIndex : internalHoveredIndex;
  
  const setHoveredIndex = (index: number | null) => {
    setInternalHoveredIndex(index);
    if (onHoverChange) onHoverChange(index);
  };

  const renderContent = (actualSize: number) => {
    const centerX = actualSize / 2;
    const centerY = actualSize / 2;

    return (
      <RingChartContext.Provider
        value={{
          data,
          size: actualSize,
          strokeWidth,
          ringGap,
          baseInnerRadius,
          hoveredIndex,
          setHoveredIndex,
          centerX,
          centerY,
        }}
      >
        <div className={`relative inline-block ${className}`} style={{ width: actualSize, height: actualSize }}>
          <svg width={actualSize} height={actualSize} className="overflow-visible">
            <Group top={centerY} left={centerX}>
              {children}
            </Group>
          </svg>
        </div>
      </RingChartContext.Provider>
    );
  };

  if (size !== undefined) {
    return renderContent(size);
  }

  return (
    <div className={`w-full h-full min-h-[200px] flex items-center justify-center ${className}`}>
      <ParentSize>
        {({ width, height }) => {
          const actualSize = Math.min(width, height);
          return renderContent(actualSize);
        }}
      </ParentSize>
    </div>
  );
}

export interface RingProps {
  index: number;
  color?: string;
  animate?: boolean;
  showGlow?: boolean;
  lineCap?: "round" | "butt";
}

export function Ring({
  index,
  color,
  animate = true,
  showGlow = true,
  lineCap = "round",
}: RingProps) {
  const { data, strokeWidth, ringGap, baseInnerRadius, hoveredIndex, setHoveredIndex } = useRingChart();
  
  const item = data[index];
  if (!item) return null;

  const radius = baseInnerRadius + index * (strokeWidth + ringGap) + strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  
  const ratio = Math.min(Math.max(item.value / (item.maxValue || 1), 0), 1);
  const progressLength = ratio * circumference;
  
  const itemColor = color || item.color || `var(--chart-${(index % 5) + 1})`;
  const isHovered = hoveredIndex === index;
  const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;

  return (
    <g
      onMouseEnter={() => setHoveredIndex(index)}
      onMouseLeave={() => setHoveredIndex(null)}
      className="cursor-pointer transition-opacity duration-300"
      style={{ opacity: isOtherHovered ? 0.3 : 1 }}
    >
      {/* Background Track */}
      <circle
        r={radius}
        cx={0}
        cy={0}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-gray-100 dark:text-slate-800/50 transition-colors"
      />
      
      {/* Animated Progress Arc */}
      <motion.circle
        r={radius}
        cx={0}
        cy={0}
        fill="none"
        stroke={itemColor}
        strokeWidth={strokeWidth}
        strokeLinecap={lineCap}
        strokeDasharray={`${circumference} ${circumference}`}
        initial={animate ? { strokeDashoffset: circumference } : { strokeDashoffset: circumference - progressLength }}
        animate={{ strokeDashoffset: circumference - progressLength }}
        transition={{ duration: 1, type: "spring", bounce: 0, delay: index * 0.1 }}
        style={{
          transform: "rotate(-90deg)",
          transformOrigin: "0 0",
          filter: isHovered && showGlow ? `drop-shadow(0 0 6px ${itemColor}80)` : "none",
        }}
      />
    </g>
  );
}

export interface RingCenterProps {
  defaultLabel?: string;
  formatValue?: (value: number) => string;
  children?: (props: { hoveredItem: RingData | null; totalValue: number }) => React.ReactNode;
  className?: string;
}

export function RingCenter({
  defaultLabel = "Total",
  formatValue = (v) => v.toLocaleString(),
  children,
  className = "",
}: RingCenterProps) {
  const { data, hoveredIndex } = useRingChart();
  
  const totalValue = data.reduce((sum, item) => sum + item.value, 0);
  const hoveredItem = hoveredIndex !== null ? data[hoveredIndex] : null;
  
  const displayValue = hoveredItem ? hoveredItem.value : totalValue;
  const displayLabel = hoveredItem ? hoveredItem.label : defaultLabel;

  if (children) {
    return <>{children({ hoveredItem, totalValue })}</>;
  }

  return (
    <foreignObject x="-100" y="-100" width="200" height="200" className="pointer-events-none">
      <div className={`w-full h-full flex flex-col items-center justify-center text-center ${className}`}>
        <motion.div
          key={hoveredIndex === null ? "total" : "hovered"}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center"
        >
          <div className="text-3xl font-bold text-gray-900 dark:text-white flex items-center justify-center">
            <NumberFlow value={displayValue} format={{ notation: "compact" }} />
          </div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1">
            {displayLabel}
          </div>
        </motion.div>
      </div>
    </foreignObject>
  );
}
