"use client";

import React, { useState } from "react";
import { useT } from "@/components/LanguageProvider";
import type { BarDatum } from "@/lib/dashboard/metrics";

/**
 * How the work is spread — over people, or over the board's groups.
 *
 * Horizontal rather than vertical because the categories are named things, and
 * names under vertical bars either rotate or truncate. Groups wear the colour
 * the board gives them, so a bar here and a group header on the main table are
 * recognisably the same thing. People get one restrained hue: their name is
 * already on the row, so a colour per person would be decoration.
 */

type Mode = "people" | "groups";

interface DistributionCardProps {
  byAssignee: BarDatum[];
  byGroup: BarDatum[];
  emptyPeople: string;
  emptyGroups: string;
}

export function DistributionCard({
  byAssignee,
  byGroup,
  emptyPeople,
  emptyGroups,
}: DistributionCardProps) {
  const t = useT();
  const [mode, setMode] = useState<Mode>("people");

  const rows = mode === "people" ? byAssignee : byGroup;
  const empty = mode === "people" ? emptyPeople : emptyGroups;
  const ceiling = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          {t("dash.distribution")}
        </h3>
        <div
          role="tablist"
          aria-label={t("dash.distribution")}
          className="flex gap-0.5 p-0.5 rounded-lg bg-gray-100 dark:bg-slate-800"
        >
          <Tab active={mode === "people"} onClick={() => setMode("people")}>
            {t("dash.byPeople")}
          </Tab>
          <Tab active={mode === "groups"} onClick={() => setMode("groups")}>
            {t("dash.byGroups")}
          </Tab>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-6">{empty}</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3.5 text-sm">
              <span
                className="w-28 shrink-0 truncate text-gray-700 dark:text-gray-200 font-medium"
                title={row.label}
              >
                {row.label}
              </span>
              <span className="flex-1 h-3 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                {/* Square at the baseline, rounded at the data end. */}
                <span
                  className="block h-full rounded-r-full"
                  style={{
                    width: `${Math.round((row.value / ceiling) * 100)}%`,
                    background: row.color,
                  }}
                />
              </span>
              {/* Direct-labelled, so no value depends on a hover. */}
              <span className="w-6 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
        active
          ? "bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 shadow-sm"
          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

export default DistributionCard;
