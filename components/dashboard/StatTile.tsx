"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * One headline number.
 *
 * A stat tile rather than a one-bar chart: a single current value is a figure,
 * not a plot. The value stays in text ink even on the critical tile - the tinted
 * icon carries the state, so meaning never rests on colour alone.
 */

export type StatTone = "neutral" | "info" | "good" | "warning" | "critical";

/** Status steps, reserved for state and deliberately distinct from the series hue. */
const TONES: Record<StatTone, { icon: string; tint: string }> = {
  neutral: { icon: "#5b7fa8", tint: "bg-slate-100 dark:bg-slate-800" },
  info: { icon: "#3b82f6", tint: "bg-blue-50 dark:bg-blue-900/30" },
  good: { icon: "#0ca30c", tint: "bg-emerald-50 dark:bg-emerald-950/40" },
  warning: { icon: "#b47c05", tint: "bg-amber-50 dark:bg-amber-950/40" },
  critical: { icon: "#d03b3b", tint: "bg-red-50 dark:bg-red-950/40" },
};

interface StatTileProps {
  label: string;
  value: number;
  /** A short qualifier under the value - "60% of all tasks". */
  detail?: string;
  icon: LucideIcon;
  tone?: StatTone;
}

export function StatTile({ label, value, detail, icon: Icon, tone = "neutral" }: StatTileProps) {
  const { icon, tint } = TONES[tone];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</h3>
        <span className={`p-1.5 rounded-lg shrink-0 ${tint}`}>
          {/* The icon is the state channel; it is always paired with the label. */}
          <Icon size={16} style={{ color: icon }} aria-hidden />
        </span>
      </div>
      {/* Proportional figures: tabular digits make a large standalone number look loose. */}
      <div className="mt-3 text-3xl font-semibold text-gray-900 dark:text-gray-50">{value}</div>
      {detail && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</div>
      )}
    </div>
  );
}

export default StatTile;
