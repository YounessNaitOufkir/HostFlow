"use client";

import React from "react";

/**
 * Horizontal bars for "how many per category".
 *
 * Horizontal rather than vertical because the categories are named things -
 * groups, people - and long names on a vertical axis end up rotated 90 degrees
 * and unreadable, which is what the previous chart did.
 *
 * One hue for every bar. These categories carry no order and no identity beyond
 * their label, so colouring each one differently would spend the identity channel
 * re-encoding what bar length already shows.
 */

export interface BarListDatum {
  key: string;
  label: string;
  value: number;
}

interface BarListProps {
  data: BarListDatum[];
  emptyMessage: string;
  /** Longest bar is scaled to this; defaults to the largest value present. */
  max?: number;
}

export function BarList({ data, emptyMessage, max }: BarListProps) {
  const ceiling = Math.max(max ?? 0, ...data.map((d) => d.value), 1);

  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 py-6">{emptyMessage}</p>
    );
  }

  return (
    // The series hue as a variable so the dark step is a selected value rather
    // than an automatic flip of the light one.
    <ul className="space-y-3 [--series:#2a78d6] dark:[--series:#3987e5]">
      {data.map((d) => {
        const pct = Math.round((d.value / ceiling) * 100);
        return (
          <li key={d.key} className="flex items-center gap-3 text-sm">
            <span
              className="w-32 shrink-0 truncate text-gray-700 dark:text-gray-200"
              title={d.label}
            >
              {d.label}
            </span>
            <span className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
              {/* Square at the baseline, 4px rounded at the data end. */}
              <span
                className="block h-full rounded-r"
                style={{ width: `${pct}%`, background: "var(--series)" }}
              />
            </span>
            {/* Direct-labelled, so the value never depends on a hover. */}
            <span className="w-8 text-right font-medium tabular-nums text-gray-900 dark:text-gray-100">
              {d.value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default BarList;
