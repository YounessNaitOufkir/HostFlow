"use client";

import React, { useState } from "react";
import { Check, Filter, X } from "lucide-react";
import type { Profile } from "@/types";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import {
  countActiveClauses,
  isPortfolioFilterActive,
  windowForPreset,
  EMPTY_PORTFOLIO_FILTER,
  type PortfolioFilter,
  type PortfolioWindowPreset,
} from "@/lib/gantt/portfolioFilter";

interface GanttPortfolioFiltersProps {
  filter: PortfolioFilter;
  onChange: (filter: PortfolioFilter) => void;
  /** Owners actually present on the selected boards. */
  assigneeIds: string[];
  profiles: Profile[];
  /** Status labels actually in use. */
  statuses: string[];
  /** How many tasks survive the current filter, and how many there are. */
  showing: { shown: number; total: number };
}

const PRESETS: { key: PortfolioWindowPreset; label: string }[] = [
  { key: "all", label: "Any time" },
  { key: "30", label: "Next 30 days" },
  { key: "90", label: "Next 90 days" },
  { key: "quarter", label: "This quarter" },
];

/**
 * Filters for the portfolio.
 *
 * A board's Gantt inherits the board's own filter bar. This one had nothing but
 * a board checklist, so a dozen properties arrived as one wall of bars and
 * "what is Amina on this month" meant reading all of it.
 */
export function GanttPortfolioFilters({
  filter,
  onChange,
  assigneeIds,
  profiles,
  statuses,
  showing,
}: GanttPortfolioFiltersProps) {
  const [open, setOpen] = useState(false);
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(open, {
    align: "left",
    onDismiss: () => setOpen(false),
  });

  const active = isPortfolioFilterActive(filter);
  const clauses = countActiveClauses(filter);

  const nameOf = (id: string) =>
    profiles.find((p) => p.id === id)?.full_name ?? "Unknown person";

  const toggle = (key: "assigneeIds" | "statuses", value: string) => {
    const current = filter[key];
    onChange({
      ...filter,
      [key]: current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    });
  };

  const activePreset: PortfolioWindowPreset = !filter.from && !filter.to ? "all" : "custom";

  return (
    <div className="relative" ref={anchorRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md shadow-sm transition-colors text-sm font-medium ${
          active
            ? "bg-blue-50 dark:bg-blue-900/25 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
            : "bg-white dark:bg-[#1e2333] border-gray-200 dark:border-[#2d3555] hover:bg-gray-50 dark:hover:bg-[#252a3f] text-gray-700 dark:text-gray-200"
        }`}
        title="Filter the portfolio by owner, status or dates"
      >
        <Filter size={14} className={active ? "" : "text-gray-500 dark:text-gray-400"} />
        Filters
        {clauses > 0 && (
          <span className="ml-0.5 px-1.5 rounded-full bg-blue-500 text-white text-[10px] font-bold tabular-nums">
            {clauses}
          </span>
        )}
      </button>

      {active && (
        <span className="ml-2 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
          {showing.shown} of {showing.total} tasks
        </span>
      )}

      {open && (
        <div
          ref={menuRef}
          style={menuStyle}
          className="w-72 max-h-[70vh] overflow-y-auto bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-lg z-[60] p-2"
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Filters
            </span>
            {active && (
              <button
                type="button"
                onClick={() => onChange(EMPTY_PORTFOLIO_FILTER)}
                className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-red-500 dark:text-gray-400"
              >
                <X size={11} />
                Clear all
              </button>
            )}
          </div>

          <Section title="Owner">
            {assigneeIds.length === 0 ? (
              <Empty>No one is assigned on these boards</Empty>
            ) : (
              assigneeIds.map((id) => (
                <Option
                  key={id}
                  label={nameOf(id)}
                  checked={filter.assigneeIds.includes(id)}
                  onClick={() => toggle("assigneeIds", id)}
                />
              ))
            )}
          </Section>

          <Section title="Status">
            {statuses.length === 0 ? (
              <Empty>These boards have no status column</Empty>
            ) : (
              statuses.map((status) => (
                <Option
                  key={status}
                  label={status}
                  checked={filter.statuses.includes(status)}
                  onClick={() => toggle("statuses", status)}
                />
              ))
            )}
          </Section>

          <Section title="Dates">
            {PRESETS.map(({ key, label }) => (
              <Option
                key={key}
                label={label}
                checked={key === "all" ? activePreset === "all" : isPreset(filter, key)}
                onClick={() => onChange({ ...filter, ...windowForPreset(key, new Date()) })}
              />
            ))}

            <div className="flex items-center gap-1.5 px-2 pt-1.5">
              <input
                type="date"
                aria-label="From"
                value={filter.from ?? ""}
                onChange={(e) => onChange({ ...filter, from: e.target.value || undefined })}
                className="w-full px-1.5 py-1 text-[11px] rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200"
              />
              <span className="text-gray-400 text-[11px]">to</span>
              <input
                type="date"
                aria-label="To"
                value={filter.to ?? ""}
                onChange={(e) => onChange({ ...filter, to: e.target.value || undefined })}
                className="w-full px-1.5 py-1 text-[11px] rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200"
              />
            </div>
            {/* Overlap, not containment: a task running through the window is in
                it, even though neither of its own dates falls inside. */}
            <p className="px-2 pt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
              Shows anything running during the window.
            </p>
          </Section>
        </div>
      )}
    </div>
  );
}

function isPreset(filter: PortfolioFilter, preset: PortfolioWindowPreset): boolean {
  const wanted = windowForPreset(preset, new Date());
  return filter.from === wanted.from && filter.to === wanted.to;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 dark:border-[#2d3555] pt-2 mt-1 first:border-0 first:mt-0 first:pt-0">
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {title}
      </div>
      {children}
    </div>
  );
}

function Option({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors"
    >
      <span
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
          checked
            ? "bg-blue-500 border-blue-500 text-white"
            : "border-gray-300 dark:border-slate-600"
        }`}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{label}</span>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 py-1.5 text-[11px] text-gray-400 dark:text-gray-500">{children}</p>
  );
}
