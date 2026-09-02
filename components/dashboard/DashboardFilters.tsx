"use client";

import React, { useState } from "react";
import { Check, Filter, X } from "lucide-react";
import type { Group, Profile } from "@/types";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { useT } from "@/components/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n";
import {
  countActiveClauses,
  isDashboardFilterActive,
  windowForPreset,
  EMPTY_DASHBOARD_FILTER,
  type DashboardFilter,
  type DashboardWindowPreset,
} from "@/lib/dashboard/filter";

interface DashboardFiltersProps {
  filter: DashboardFilter;
  onChange: (filter: DashboardFilter) => void;
  /** Only people actually carrying work on this board. */
  assigneeIds: string[];
  profiles: Profile[];
  groups: Group[];
  showing: { shown: number; total: number };
}

const PRESETS: { key: DashboardWindowPreset; labelKey: TranslationKey }[] = [
  { key: "all", labelKey: "master.windowAll" },
  { key: "30", labelKey: "master.window30" },
  { key: "90", labelKey: "master.window90" },
];

/**
 * One filter row for the whole dashboard.
 *
 * Deliberately not per-card: filters inside a chart let two cards on the same
 * screen describe different slices, with no way for a reader to see that they do.
 */
export function DashboardFilters({
  filter,
  onChange,
  assigneeIds,
  profiles,
  groups,
  showing,
}: DashboardFiltersProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(open, {
    align: "left",
    onDismiss: () => setOpen(false),
  });

  const active = isDashboardFilterActive(filter);
  const clauses = countActiveClauses(filter);

  const nameOf = (id: string) =>
    profiles.find((p) => p.id === id)?.full_name ?? t("master.unknownPerson");

  const toggle = (key: "assigneeIds" | "groupIds", value: string) => {
    const current = filter[key];
    onChange({
      ...filter,
      [key]: current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    });
  };

  const isPreset = (preset: DashboardWindowPreset) => {
    const wanted = windowForPreset(preset, new Date());
    return filter.from === wanted.from && filter.to === wanted.to;
  };

  return (
    <div className="flex items-center gap-3">
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
          title={t("dash.filtersHint")}
        >
          <Filter size={14} className={active ? "" : "text-gray-500 dark:text-gray-400"} />
          {t("master.filters")}
          {clauses > 0 && (
            <span className="ml-0.5 px-1.5 rounded-full bg-blue-500 text-white text-[10px] font-bold tabular-nums">
              {clauses}
            </span>
          )}
        </button>

        {open && (
          <div
            ref={menuRef}
            style={menuStyle}
            className="w-72 max-h-[70vh] overflow-y-auto bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-lg z-[60] p-2"
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {t("master.filters")}
              </span>
              {active && (
                <button
                  type="button"
                  onClick={() => onChange(EMPTY_DASHBOARD_FILTER)}
                  className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-red-500 dark:text-gray-400"
                >
                  <X size={11} />
                  {t("master.clearAll")}
                </button>
              )}
            </div>

            <Section title={t("master.filterOwner")}>
              {assigneeIds.length === 0 ? (
                <Empty>{t("dash.noOwners")}</Empty>
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

            <Section title={t("dash.filterGroup")}>
              {groups.length === 0 ? (
                <Empty>{t("dash.noGroups")}</Empty>
              ) : (
                groups.map((g) => (
                  <Option
                    key={g.id}
                    label={g.title}
                    checked={filter.groupIds.includes(g.id)}
                    onClick={() => toggle("groupIds", g.id)}
                  />
                ))
              )}
            </Section>

            <Section title={t("master.filterDates")}>
              {PRESETS.map(({ key, labelKey }) => (
                <Option
                  key={key}
                  label={t(labelKey)}
                  checked={key === "all" ? !filter.from && !filter.to : isPreset(key)}
                  onClick={() => onChange({ ...filter, ...windowForPreset(key, new Date()) })}
                />
              ))}

              <div className="flex items-center gap-1.5 px-2 pt-1.5">
                <input
                  type="date"
                  aria-label={t("master.windowFrom")}
                  value={filter.from ?? ""}
                  onChange={(e) => onChange({ ...filter, from: e.target.value || undefined })}
                  className="w-full px-1.5 py-1 text-[11px] rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200"
                />
                <span className="text-gray-400 text-[11px]">
                  {t("master.windowTo").toLowerCase()}
                </span>
                <input
                  type="date"
                  aria-label={t("master.windowTo")}
                  value={filter.to ?? ""}
                  onChange={(e) => onChange({ ...filter, to: e.target.value || undefined })}
                  className="w-full px-1.5 py-1 text-[11px] rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200"
                />
              </div>
              {/* Said out loud, because a date window changes what every tile means. */}
              <p className="px-2 pt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                {t("dash.windowHint")}
              </p>
            </Section>
          </div>
        )}
      </div>

      {active && (
        <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
          {t("master.showingTasks", { shown: showing.shown, total: showing.total })}
        </span>
      )}
    </div>
  );
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
  return <p className="px-2 py-1.5 text-[11px] text-gray-400 dark:text-gray-500">{children}</p>;
}

export default DashboardFilters;
