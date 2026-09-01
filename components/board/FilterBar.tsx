"use client";

import React, { useState } from "react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { Search, Filter, X, Plus, Trash2, ArrowUpDown, Eye, EyeOff } from "lucide-react";
import { Column, STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/types";

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  columns: Column[];
  filters: any; // UseFiltersReturn
  hiddenColumns?: string[];
  onToggleColumnVisibility?: (columnId: string) => void;
  onAddTask?: () => void;
  /**
   * Hides the column show/hide control.
   *
   * It governs which board columns the table and kanban render. The Gantt draws
   * bars from a date column and keeps its own field picker, so the control did
   * nothing there but sit next to a second button also called "Columns".
   */
  showColumnPicker?: boolean;
}

export default function FilterBar({ searchQuery, setSearchQuery, columns, filters, hiddenColumns = [], onToggleColumnVisibility, onAddTask, showColumnPicker = true }: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newColumnId, setNewColumnId] = useState("");
  const [newOperator, setNewOperator] = useState("equals");
  const [newValue, setNewValue] = useState("");

  const handleAddFilter = () => {
    if (!newColumnId || !newValue) return;
    filters.addFilter(newColumnId, newOperator, newValue);
    setNewColumnId("");
    setNewValue("");
    setShowAdvanced(false);
  };

  const [showColumnsMenu, setShowColumnsMenu] = useState(false);

  const [showSortMenu, setShowSortMenu] = useState(false);
  const { anchorRef: sortMenuAnchor, menuRef: sortMenuRef, menuStyle: sortMenuStyle } = useAnchoredMenu(showSortMenu, { align: 'left' });
  const { anchorRef: advancedMenuAnchor, menuRef: advancedMenuRef, menuStyle: advancedMenuStyle } = useAnchoredMenu(showAdvanced, { align: 'left' });
  const { anchorRef: columnsMenuAnchor, menuRef: columnsMenuRef, menuStyle: columnsMenuStyle } = useAnchoredMenu(showColumnsMenu, { align: 'left' });
  const [newSortColumnId, setNewSortColumnId] = useState("");
  const [newSortDirection, setNewSortDirection] = useState<"asc" | "desc">("asc");

  const handleAddSort = () => {
    if (!newSortColumnId) return;
    filters.addSort(newSortColumnId, newSortDirection);
    setNewSortColumnId("");
    setNewSortDirection("asc");
    setShowSortMenu(false);
  };

  const activeRules = filters.filterRules || [];
  const activeSorts = filters.sortRules || [];

  return (
    <div className="flex flex-col border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-[#181b34] shrink-0">
      <div className="flex items-center gap-3 py-3 px-8">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 transition-shadow"
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
          <div className="relative" ref={sortMenuAnchor}>
            <button
              onClick={() => { setShowSortMenu(!showSortMenu); setShowAdvanced(false); setShowColumnsMenu(false); }}
              className={`flex items-center gap-2 py-1.5 px-3 text-sm rounded-lg border transition-shadow focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                activeSorts.length > 0 || showSortMenu 
                  ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" 
                  : "bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700/50 text-gray-700 dark:text-gray-200"
              }`}
            >
              <ArrowUpDown size={14} />
              <span>Sort {activeSorts.length > 0 ? `/ ${activeSorts.length}` : ''}</span>
            </button>

            {showSortMenu && (
              <div ref={sortMenuRef} style={sortMenuStyle} className="w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl z-[60] p-4">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Sort by</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Column</label>
                    <select
                      value={newSortColumnId}
                      onChange={(e) => setNewSortColumnId(e.target.value)}
                      className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                    >
                      <option value="">Select column...</option>
                      {columns.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Order</label>
                    <select
                      value={newSortDirection}
                      onChange={(e) => setNewSortDirection(e.target.value as "asc" | "desc")}
                      className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                    >
                      <option value="asc">Ascending (A-Z, Old-New)</option>
                      <option value="desc">Descending (Z-A, New-Old)</option>
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
                      disabled={!newSortColumnId}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Apply Sort
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={advancedMenuAnchor}>
            <button
              onClick={() => { setShowAdvanced(!showAdvanced); setShowSortMenu(false); setShowColumnsMenu(false); }}
            className={`flex items-center gap-2 py-1.5 px-3 text-sm rounded-lg border transition-shadow focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
              activeRules.length > 0 || showAdvanced 
                ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" 
                : "bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700/50 text-gray-700 dark:text-gray-200"
            }`}
          >
            <Filter size={14} />
            <span>Filter</span>
            {activeRules.length > 0 && (
              <span className="ml-1 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {activeRules.length}
              </span>
            )}
          </button>

          {showAdvanced && (
            <div ref={advancedMenuRef} style={advancedMenuStyle} className="w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl z-[60] p-4">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Add Filter</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Column</label>
                  <select
                    value={newColumnId}
                    onChange={(e) => setNewColumnId(e.target.value)}
                    className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                  >
                    <option value="">Select column...</option>
                    {columns.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Condition</label>
                  {(() => {
                    const selCol = columns.find((c) => c.id === newColumnId);
                    if (selCol?.type === "timeline") {
                      return (
                        <select
                          value={newOperator}
                          onChange={(e) => setNewOperator(e.target.value)}
                          className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                        >
                          <option value="equals">Is exactly</option>
                          <option value="not_equals">Is not exactly</option>
                          <option value="is_before">Is before</option>
                          <option value="is_after">Is after</option>
                          <option value="is_empty">Is empty</option>
                          <option value="is_not_empty">Is not empty</option>
                        </select>
                      );
                    }
                    return (
                      <select
                        value={newOperator}
                        onChange={(e) => setNewOperator(e.target.value)}
                        className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                      >
                        <option value="equals">Is</option>
                        <option value="not_equals">Is not</option>
                        <option value="contains">Contains</option>
                        <option value="not_contains">Does not contain</option>
                        <option value="greater_than">Greater than</option>
                        <option value="less_than">Less than</option>
                        <option value="is_empty">Is empty</option>
                        <option value="is_not_empty">Is not empty</option>
                      </select>
                    );
                  })()}
                </div>
                {newOperator !== "is_empty" && newOperator !== "is_not_empty" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Value</label>
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
                              <option key={o.label} value={o.label}>{o.label}</option>
                            ))}
                          </select>
                        );
                      }
                      if (selCol?.type === "timeline") {
                        return (
                          <input
                            type="date"
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            className="w-full py-1.5 px-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                          />
                        );
                      }
                      return (
                        <input
                          type="text"
                          value={newValue}
                          onChange={(e) => setNewValue(e.target.value)}
                          placeholder="Value..."
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
                    disabled={!newColumnId || (newOperator !== "is_empty" && newOperator !== "is_not_empty" && !newValue)}
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
              className={`flex items-center gap-2 py-1.5 px-3 text-sm rounded-lg border transition-shadow focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                hiddenColumns.length > 0 || showColumnsMenu 
                  ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" 
                  : "bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700/50 text-gray-700 dark:text-gray-200"
              }`}
              title="Hide / Show Columns"
            >
              {hiddenColumns.length > 0 ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>Columns {hiddenColumns.length > 0 ? `(${columns.length - hiddenColumns.length}/${columns.length})` : ''}</span>
            </button>

            {showColumnsMenu && (
              <div ref={columnsMenuRef} style={columnsMenuStyle} className="w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl z-[60] p-4 custom-scrollbar">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Visible Columns</h4>
                <div className="space-y-1">
                  {columns.map(c => (
                    <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.includes(c.id)}
                        onChange={() => onToggleColumnVisibility && onToggleColumnVisibility(c.id)}
                        className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-transparent"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{c.title}</span>
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
              <span>New Task</span>
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
                const opLabels: Record<string, string> = {
                  eq: "=", neq: "≠", contains: "contains", not_contains: "not contains", is_empty: "is empty", is_not_empty: "is not empty"
                };
                return (
                  <div key={rule.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 rounded-md text-xs">
                    <span className="font-semibold">{col?.title || 'Unknown'}</span>
                    <span className="text-blue-500 dark:text-blue-400">{opLabels[rule.operator]}</span>
                    {rule.operator !== "is_empty" && rule.operator !== "is_not_empty" && (
                      <span className="font-medium">"{rule.value}"</span>
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
                return (
                  <div key={sort.columnId} className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 rounded-md text-xs">
                    <span className="font-semibold">{col?.title || 'Unknown'}</span>
                    <span className="text-purple-500 dark:text-purple-400">({sort.direction === 'asc' ? 'Ascending' : 'Descending'})</span>
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
