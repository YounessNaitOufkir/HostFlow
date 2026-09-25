"use client";

import React, { useState } from "react";
import { displayColumnTitle, displayCellLabel } from "@/lib/i18n/labels";
import { useT } from "@/components/LanguageProvider";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import DateField from "@/components/ui/DateField";
import { Search, Filter, X, Plus, Trash2, ArrowUpDown, Eye, EyeOff } from "lucide-react";
import { Column, ColumnType, Profile, STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/types";
import type { TranslationKey } from "@/lib/i18n";

/** Column types with no stored, filterable value (see hooks/useFilters.ts's matchesRule). */
const UNFILTERABLE_COLUMN_TYPES: ColumnType[] = ["formula", "relation"];

interface OperatorOption {
  value: string;
  labelKey: TranslationKey;
}

/** Which filter conditions make sense for a column's stored value shape. */
function getOperatorOptions(colType: ColumnType | undefined): OperatorOption[] {
  switch (colType) {
    case "timeline":
      return [
        { value: "equals", labelKey: "filter.is" },
        { value: "not_equals", labelKey: "filter.isNot" },
        { value: "is_before", labelKey: "filter.isBefore" },
        { value: "is_after", labelKey: "filter.isAfter" },
        { value: "is_between", labelKey: "filter.isBetween" },
      ];
    case "date":
      return [
        { value: "equals", labelKey: "filter.is" },
        { value: "not_equals", labelKey: "filter.isNot" },
        { value: "is_before", labelKey: "filter.isBefore" },
        { value: "is_after", labelKey: "filter.isAfter" },
        { value: "is_between", labelKey: "filter.isBetween" },
        { value: "is_empty", labelKey: "filter.isEmpty" },
        { value: "is_not_empty", labelKey: "filter.isNotEmpty" },
      ];
    case "numbers":
      return [
        { value: "equals", labelKey: "filter.is" },
        { value: "not_equals", labelKey: "filter.isNot" },
        { value: "greater_than", labelKey: "filter.greaterThan" },
        { value: "less_than", labelKey: "filter.lessThan" },
        { value: "is_between", labelKey: "filter.isBetween" },
        { value: "is_empty", labelKey: "filter.isEmpty" },
        { value: "is_not_empty", labelKey: "filter.isNotEmpty" },
      ];
    case "rating":
      return [
        { value: "equals", labelKey: "filter.is" },
        { value: "greater_than", labelKey: "filter.greaterThan" },
        { value: "less_than", labelKey: "filter.lessThan" },
        { value: "is_empty", labelKey: "filter.isEmpty" },
      ];
    case "checkbox":
      return [
        { value: "is_checked", labelKey: "filter.isChecked" },
        { value: "is_not_checked", labelKey: "filter.isNotChecked" },
      ];
    case "people":
      return [
        { value: "equals", labelKey: "filter.is" },
        { value: "not_equals", labelKey: "filter.isNot" },
        { value: "is_empty", labelKey: "filter.isEmpty" },
      ];
    case "tags":
      return [
        { value: "equals", labelKey: "filter.is" },
        { value: "not_equals", labelKey: "filter.isNot" },
        { value: "is_empty", labelKey: "filter.isEmpty" },
        { value: "is_not_empty", labelKey: "filter.isNotEmpty" },
      ];
    case "files":
    case "dependency":
      return [
        { value: "is_empty", labelKey: "filter.isEmpty" },
        { value: "is_not_empty", labelKey: "filter.isNotEmpty" },
      ];
    case "link":
      return [
        { value: "contains", labelKey: "filter.contains" },
        { value: "is_empty", labelKey: "filter.isEmpty" },
        { value: "is_not_empty", labelKey: "filter.isNotEmpty" },
      ];
    case "status":
    case "priority":
      return [
        { value: "equals", labelKey: "filter.is" },
        { value: "not_equals", labelKey: "filter.isNot" },
        { value: "is_empty", labelKey: "filter.isEmpty" },
        { value: "is_not_empty", labelKey: "filter.isNotEmpty" },
      ];
    default:
      // text and anything unrecognized
      return [
        { value: "equals", labelKey: "filter.is" },
        { value: "not_equals", labelKey: "filter.isNot" },
        { value: "contains", labelKey: "filter.contains" },
        { value: "not_contains", labelKey: "filter.doesNotContain" },
        { value: "is_empty", labelKey: "filter.isEmpty" },
        { value: "is_not_empty", labelKey: "filter.isNotEmpty" },
      ];
  }
}

const VALUELESS_OPERATORS = new Set(["is_empty", "is_not_empty", "is_checked", "is_not_checked"]);

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  columns: Column[];
  filters: any; // UseFiltersReturn
  hiddenColumns?: string[];
  onToggleColumnVisibility?: (columnId: string) => void;
  onAddTask?: () => void;
  /** Needed to offer a person picker as the filter value for People columns. */
  profiles?: Profile[];
  /**
   * Hides the column show/hide control.
   *
   * It governs which board columns the table and kanban render. The Gantt draws
   * bars from a date column and keeps its own field picker, so the control did
   * nothing there but sit next to a second button also called "Columns".
   */
  showColumnPicker?: boolean;
  /** The Gantt orders bars by date internally and has no use for the generic sort menu. */
  showSortButton?: boolean;
}

export default function FilterBar({ searchQuery, setSearchQuery, columns, filters, hiddenColumns = [], onToggleColumnVisibility, onAddTask, profiles = [], showColumnPicker = true, showSortButton = true }: FilterBarProps) {
  const t = useT();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newColumnId, setNewColumnId] = useState("");
  const [newOperator, setNewOperator] = useState("equals");
  const [newValue, setNewValue] = useState("");
  const [newValueEnd, setNewValueEnd] = useState("");

  const handleAddFilter = () => {
    if (!newColumnId) return;
    if (VALUELESS_OPERATORS.has(newOperator)) {
      filters.addFilter(newColumnId, newOperator, "");
    } else if (newOperator === "is_between") {
      if (!newValue || !newValueEnd) return;
      filters.addFilter(newColumnId, newOperator, [newValue, newValueEnd]);
    } else {
      if (!newValue) return;
      filters.addFilter(newColumnId, newOperator, newValue);
    }
    setNewColumnId("");
    setNewValue("");
    setNewValueEnd("");
    setShowAdvanced(false);
  };

  const [showColumnsMenu, setShowColumnsMenu] = useState(false);

  const [showSortMenu, setShowSortMenu] = useState(false);
  const { anchorRef: sortMenuAnchor, menuRef: sortMenuRef, menuStyle: sortMenuStyle } = useAnchoredMenu(showSortMenu, { align: 'left' });
  const { anchorRef: advancedMenuAnchor, menuRef: advancedMenuRef, menuStyle: advancedMenuStyle } = useAnchoredMenu(showAdvanced, { align: 'left' });
  const { anchorRef: columnsMenuAnchor, menuRef: columnsMenuRef, menuStyle: columnsMenuStyle } = useAnchoredMenu(showColumnsMenu, { align: 'left' });
  const [newSortColumnId, setNewSortColumnId] = useState("");
  const [newSortDirection, setNewSortDirection] = useState<"asc" | "desc">("asc");

  const sortableColumns = columns.filter((c) => c.type === "timeline");
  const singleSortColumn = sortableColumns.length === 1 ? sortableColumns[0] : null;
  const effectiveSortColumnId = singleSortColumn?.id || newSortColumnId;

  const handleAddSort = () => {
    if (!effectiveSortColumnId) return;
    filters.addSort(effectiveSortColumnId, newSortDirection);
    setNewSortColumnId("");
    setNewSortDirection("asc");
    setShowSortMenu(false);
  };

  const activeRules = filters.filterRules || [];
  const activeSorts = filters.sortRules || [];

  const filterableColumns = columns.filter((c) => !UNFILTERABLE_COLUMN_TYPES.includes(c.type));
  const newFilterColumn = filterableColumns.find((c) => c.id === newColumnId);
  const newOperatorOptions = getOperatorOptions(newFilterColumn?.type);

  const newSortColumn = sortableColumns.find((c) => c.id === effectiveSortColumnId);
  const isNewSortByDate = newSortColumn?.type === "timeline" || newSortColumn?.type === "date";

  return (
    <div className="flex flex-col border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-[#181b34] shrink-0">
      <div className="flex items-center gap-3 py-3 px-8">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t("filter.searchItems")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-64 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 transition-shadow"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="h-4 w-px bg-gray-200 dark:bg-slate-700/50 mx-1"></div>

        <div className="relative flex items-center gap-2">
          {/* Sort Button */}
          {showSortButton && (
          <div className="relative" ref={sortMenuAnchor}>
            <button
              onClick={() => { setShowSortMenu(!showSortMenu); setShowAdvanced(false); setShowColumnsMenu(false); }}
              className={`flex items-center gap-2 py-1.5 px-3 text-sm rounded-lg border transition-shadow focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                activeSorts.length > 0 || showSortMenu 
                  ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" 
                  : "bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700/50 text-gray-700 dark:text-gray-200"
              }`}
            >
              <ArrowUpDown size={14} />
              <span>{t("filter.sort")} {activeSorts.length > 0 ? `/ ${activeSorts.length}` : ""}</span>
            </button>

            {showSortMenu && (
              <div ref={sortMenuRef} style={sortMenuStyle} className="w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl z-[60] p-4">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">{t("filter.sortBy")}</h4>
                <div className="space-y-3">
                  {singleSortColumn ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t("filter.column")}</label>
                      <div className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded text-gray-700 dark:text-gray-200">
                        {displayColumnTitle(t, singleSortColumn.title)}
                      </div>
                    </div>
                  ) : sortableColumns.length > 1 ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t("filter.column")}</label>
                      <select
                        value={newSortColumnId}
                        onChange={(e) => setNewSortColumnId(e.target.value)}
                        className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                      >
                        <option value="">Select column...</option>
                        {sortableColumns.map(c => (
                          <option key={c.id} value={c.id}>{displayColumnTitle(t, c.title)}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t("filter.noSortableColumns")}</p>
                  )}
                  {sortableColumns.length > 0 && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t("filter.order")}</label>
                        <select
                          value={newSortDirection}
                          onChange={(e) => setNewSortDirection(e.target.value as "asc" | "desc")}
                          className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                        >
                          {isNewSortByDate ? (
                            <>
                              <option value="asc">{t("filter.sortEarliestToLatest")}</option>
                              <option value="desc">{t("filter.sortLatestToEarliest")}</option>
                            </>
                          ) : (
                            <>
                              <option value="asc">Ascending (A-Z, Old-New)</option>
                              <option value="desc">Descending (Z-A, New-Old)</option>
                            </>
                          )}
                        </select>
                      </div>
                      <div className="pt-2 flex justify-end gap-2">
                        <button
                          onClick={() => setShowSortMenu(false)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddSort}
                          disabled={!effectiveSortColumnId}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Apply Sort
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          )}

          <div className="relative" ref={advancedMenuAnchor}>
            <button
              onClick={() => { setShowAdvanced(!showAdvanced); setShowSortMenu(false); setShowColumnsMenu(false); }}
            className={`flex items-center gap-2 py-1.5 px-3 text-sm rounded-lg border transition-shadow focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              activeRules.length > 0 || showAdvanced 
                ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" 
                : "bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700/50 text-gray-700 dark:text-gray-200"
            }`}
          >
            <Filter size={14} />
            <span>{t("filter.filter")}</span>
            {activeRules.length > 0 && (
              <span className="ml-1 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {activeRules.length}
              </span>
            )}
          </button>

          {showAdvanced && (
            <div ref={advancedMenuRef} style={advancedMenuStyle} className="w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl z-[60] p-4">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">{t("filter.addFilter")}</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t("filter.column")}</label>
                  <select
                    value={newColumnId}
                    onChange={(e) => {
                      const col = filterableColumns.find((c) => c.id === e.target.value);
                      const firstOp = getOperatorOptions(col?.type)[0]?.value || "equals";
                      setNewColumnId(e.target.value);
                      setNewOperator(firstOp);
                      setNewValue("");
                      setNewValueEnd("");
                    }}
                    className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                  >
                    <option value="">Select column...</option>
                    {filterableColumns.map(c => (
                      <option key={c.id} value={c.id}>{displayColumnTitle(t, c.title)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t("filter.condition")}</label>
                  <select
                    value={newOperator}
                    onChange={(e) => { setNewOperator(e.target.value); setNewValue(""); setNewValueEnd(""); }}
                    className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                  >
                    {newOperatorOptions.map((op) => (
                      <option key={op.value} value={op.value}>{t(op.labelKey)}</option>
                    ))}
                  </select>
                </div>
                {!VALUELESS_OPERATORS.has(newOperator) && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t("filter.value")}</label>
                    {(() => {
                      const selCol = columns.find((c) => c.id === newColumnId);
                      if (selCol?.type === "status" || selCol?.type === "priority") {
                        const opts = selCol.type === "priority" ? PRIORITY_OPTIONS : (selCol.settings?.statusLabels || STATUS_OPTIONS);
                        return (
                          <select
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                          >
                            <option value="">Select option...</option>
                            {opts.map((o) => (
                              <option key={o.label} value={o.label}>{displayCellLabel(t, selCol.type, o.label)}</option>
                            ))}
                          </select>
                        );
                      }
                      if (selCol?.type === "people") {
                        return (
                          <select
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                          >
                            <option value="">{t("filter.selectPerson")}</option>
                            {profiles.map((p) => (
                              <option key={p.id} value={p.id}>{p.full_name}</option>
                            ))}
                          </select>
                        );
                      }
                      if ((selCol?.type === "timeline" || selCol?.type === "date") && newOperator === "is_between") {
                        return (
                          <DateField
                            mode="range"
                            value={{ start: newValue || null, end: newValueEnd || null }}
                            onChange={(v) => {
                              setNewValue(v.start ?? "");
                              setNewValueEnd(v.end ?? "");
                            }}
                          />
                        );
                      }
                      if (selCol?.type === "numbers" && newOperator === "is_between") {
                        const inputType = "number";
                        return (
                          <div className="flex items-center gap-2">
                            <input
                              type={inputType}
                              value={newValue}
                              onChange={(e) => setNewValue(e.target.value)}
                              className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                            />
                            <span className="text-xs text-gray-400 shrink-0">{t("filter.and")}</span>
                            <input
                              type={inputType}
                              value={newValueEnd}
                              onChange={(e) => setNewValueEnd(e.target.value)}
                              className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                            />
                          </div>
                        );
                      }
                      if (selCol?.type === "timeline" || selCol?.type === "date") {
                        return (
                          <DateField
                            mode="single"
                            value={{ start: newValue || null, end: null }}
                            onChange={(v) => setNewValue(v.start ?? "")}
                          />
                        );
                      }
                      if (selCol?.type === "numbers" || selCol?.type === "rating") {
                        return (
                          <input
                            type="number"
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            placeholder={t("filter.valuePlaceholder")}
                            className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                          />
                        );
                      }
                      return (
                        <input
                          type="text"
                          value={newValue}
                          onChange={(e) => setNewValue(e.target.value)}
                          placeholder={t("filter.valuePlaceholder")}
                          className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                        />
                      );
                    })()}
                  </div>
                )}
                <div className="pt-2 flex justify-end gap-2">
                  <button
                    onClick={() => setShowAdvanced(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddFilter}
                    disabled={
                      !newColumnId ||
                      (VALUELESS_OPERATORS.has(newOperator)
                        ? false
                        : newOperator === "is_between"
                        ? !newValue || !newValueEnd
                        : !newValue)
                    }
                    className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Add Filter
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>

          {showColumnPicker && (
          <>
          <div className="h-4 w-px bg-gray-200 dark:bg-slate-700/50 mx-1"></div>

          {/* Hide Columns Button */}
          <div className="relative" ref={columnsMenuAnchor}>
            <button
              onClick={() => { setShowColumnsMenu(!showColumnsMenu); setShowSortMenu(false); setShowAdvanced(false); }}
              className={`flex items-center gap-2 py-1.5 px-3 text-sm rounded-lg border transition-shadow focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                hiddenColumns.length > 0 || showColumnsMenu 
                  ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" 
                  : "bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700/50 text-gray-700 dark:text-gray-200"
              }`}
              title={t("filter.columnsHint")}
            >
              {hiddenColumns.length > 0 ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{t("filter.columns")} {hiddenColumns.length > 0 ? `(${columns.length - hiddenColumns.length}/${columns.length})` : ""}</span>
            </button>

            {showColumnsMenu && (
              <div ref={columnsMenuRef} style={columnsMenuStyle} className="w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl z-[60] p-4 custom-scrollbar">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">{t("filter.visibleColumns")}</h4>
                <div className="space-y-1">
                  {columns.map(c => (
                    <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.includes(c.id)}
                        onChange={() => onToggleColumnVisibility && onToggleColumnVisibility(c.id)}
                        className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-transparent"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{displayColumnTitle(t, c.title)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          </>
          )}

          <div className="h-4 w-px bg-gray-200 dark:bg-slate-700/50 mx-1"></div>

          {/* Add Task Button */}
          {onAddTask && (
            <button
              onClick={onAddTask}
              className="flex items-center gap-1.5 py-1.5 px-3 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-[#181b34]"
            >
              <Plus size={14} />
              <span>{t("filter.newTask")}</span>
            </button>
          )}

        </div>
      </div>

      {/* Active Rules Row (Filters & Sorts) */}
      {(activeRules.length > 0 || activeSorts.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 px-8 pb-3">
          {activeRules.length > 0 && (
            <>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Filters:</span>
              {activeRules.map((rule: any) => {
                const col = columns.find(c => c.id === rule.columnId);
                const opLabel = getOperatorOptions(col?.type).find((op) => op.value === rule.operator)?.labelKey;
                const displayValue =
                  col?.type === "people"
                    ? profiles.find((p) => p.id === rule.value)?.full_name || rule.value
                    : rule.value;
                return (
                  <div key={rule.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 rounded-md text-xs">
                    <span className="font-semibold">{col?.title || 'Unknown'}</span>
                    <span className="text-blue-500 dark:text-blue-400">{opLabel ? t(opLabel) : rule.operator}</span>
                    {rule.operator === "is_between" && Array.isArray(rule.value) ? (
                      <span className="font-medium">{rule.value[0]} → {rule.value[1]}</span>
                    ) : (
                      !VALUELESS_OPERATORS.has(rule.operator) && (
                        <span className="font-medium">"{displayValue}"</span>
                      )
                    )}
                    <button
                      onClick={() => filters.removeFilter(rule.id)}
                      className="ml-1 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {activeSorts.length > 0 && (
            <>
              {activeRules.length > 0 && <div className="h-4 w-px bg-gray-200 dark:bg-slate-700 mx-2"></div>}
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Sorted by:</span>
              {activeSorts.map((sort: any) => {
                const col = columns.find(c => c.id === sort.columnId);
                const isDateSort = col?.type === "timeline" || col?.type === "date";
                const directionLabel = isDateSort
                  ? (sort.direction === 'asc' ? t("filter.sortEarliestToLatest") : t("filter.sortLatestToEarliest"))
                  : (sort.direction === 'asc' ? 'Ascending' : 'Descending');
                return (
                  <div key={sort.columnId} className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 rounded-md text-xs">
                    <span className="font-semibold">{col?.title || 'Unknown'}</span>
                    <span className="text-purple-500 dark:text-purple-400">({directionLabel})</span>
                    <button
                      onClick={() => filters.removeSort(sort.columnId)}
                      className="ml-1 text-purple-400 hover:text-purple-600 dark:hover:text-purple-200"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          <button
            onClick={() => { filters.clearFilters(); filters.clearSorts(); }}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline ml-2"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
