"use client";

// ============================================================
// useFilters — Composable filter & sort system
// ============================================================

import { useMemo, useState, useCallback } from "react";
import type { Item, Column, FilterRule, FilterOperator, SortRule, FilterLogic } from "@/types";

export interface UseFiltersReturn {
  filterRules: FilterRule[];
  filterLogic: FilterLogic;
  sortRules: SortRule[];
  filteredItems: Item[];
  addFilter: (columnId: string, operator: FilterOperator, value: FilterRule["value"]) => void;
  removeFilter: (filterId: string) => void;
  clearFilters: () => void;
  setFilterLogic: (logic: FilterLogic) => void;
  addSort: (columnId: string, direction: "asc" | "desc") => void;
  removeSort: (columnId: string) => void;
  clearSorts: () => void;
  // Legacy compatibility helpers
  filterStatus: string;
  setFilterStatus: (val: string) => void;
  filterPerson: string;
  setFilterPerson: (val: string) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
}

/**
 * Composable filter and sort hook.
 * Supports both legacy (single status/person dropdown) and new (multi-rule) modes.
 */
export function useFilters(items: Item[], columns: Column[]): UseFiltersReturn {
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [filterLogic, setFilterLogicState] = useState<FilterLogic>("and");
  const [sortRules, setSortRules] = useState<SortRule[]>([]);

  // Legacy compatibility
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPerson, setFilterPerson] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const addFilter = useCallback((columnId: string, operator: FilterOperator, value: FilterRule["value"]) => {
    const id = `filter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setFilterRules((prev) => [...prev, { id, columnId, operator, value }]);
  }, []);

  const removeFilter = useCallback((filterId: string) => {
    setFilterRules((prev) => prev.filter((f) => f.id !== filterId));
  }, []);

  const clearFilters = useCallback(() => {
    setFilterRules([]);
    setFilterStatus("all");
    setFilterPerson("all");
    setSearchQuery("");
  }, []);

  const setFilterLogic = useCallback((logic: FilterLogic) => {
    setFilterLogicState(logic);
  }, []);

  const addSort = useCallback((columnId: string, direction: "asc" | "desc") => {
    setSortRules((prev) => {
      const without = prev.filter((s) => s.columnId !== columnId);
      return [...without, { columnId, direction }];
    });
  }, []);

  const removeSort = useCallback((columnId: string) => {
    setSortRules((prev) => prev.filter((s) => s.columnId !== columnId));
  }, []);

  const clearSorts = useCallback(() => {
    setSortRules([]);
  }, []);

  // --- Apply filters and sorts ---
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Legacy filters (backward compatibility with existing dropdowns)
    if (filterStatus !== "all") {
      result = result.filter((item) => {
        // Check ALL status columns, not just the hardcoded "status" ID
        const statusCols = columns.filter((c) => c.type === "status");
        if (statusCols.length === 0) return true;
        return statusCols.some((col) => {
          const val = item.column_values?.[col.id];
          if (filterStatus === "empty") return !val || val === "Empty";
          return val === filterStatus;
        });
      });
    }

    if (filterPerson !== "all") {
      result = result.filter((item) => {
        const peopleCols = columns.filter((c) => c.type === "people");
        if (peopleCols.length === 0) return false;
        return peopleCols.some((col) => {
          const ids = item.column_values?.[col.id] || [];
          return Array.isArray(ids) && ids.includes(filterPerson);
        });
      });
    }

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => {
        if (item.name.toLowerCase().includes(q)) return true;
        // Search text columns too
        const textCols = columns.filter(c => c.type === "text");
        return textCols.some(col => {
          const val = item.column_values?.[col.id];
          return val && String(val).toLowerCase().includes(q);
        });
      });
    }

    // Advanced filter rules
    if (filterRules.length > 0) {
      result = result.filter((item) => {
        const results = filterRules.map((rule) => matchesRule(item, rule));
        return filterLogic === "and"
          ? results.every(Boolean)
          : results.some(Boolean);
      });
    }

    // Sort
    result.sort((a, b) => {
      for (const rule of sortRules) {
        const aVal = getCellSortValue(a, rule.columnId);
        const bVal = getCellSortValue(b, rule.columnId);
        const cmp = compareSortValues(aVal, bVal);
        if (cmp !== 0) return rule.direction === "asc" ? cmp : -cmp;
      }
      return a.position - b.position;
    });

    return result;
  }, [items, columns, filterStatus, filterPerson, searchQuery, filterRules, filterLogic, sortRules]);

  return {
    filterRules,
    filterLogic,
    sortRules,
    filteredItems,
    addFilter,
    removeFilter,
    clearFilters,
    setFilterLogic,
    addSort,
    removeSort,
    clearSorts,
    filterStatus,
    setFilterStatus,
    filterPerson,
    setFilterPerson,
    searchQuery,
    setSearchQuery,
  };
}

// ============================================================
// Helpers
// ============================================================

function matchesRule(item: Item, rule: FilterRule): boolean {
  const rawVal = item.column_values?.[rule.columnId];

  switch (rule.operator) {
    case "is_empty":
      if (typeof rawVal === 'object' && rawVal !== null && "start" in rawVal) return !rawVal.start && !rawVal.end;
      return rawVal === null || rawVal === undefined || rawVal === "" || (Array.isArray(rawVal) && rawVal.length === 0);
    case "is_not_empty":
      if (typeof rawVal === 'object' && rawVal !== null && "start" in rawVal) return !!rawVal.start || !!rawVal.end;
      return rawVal !== null && rawVal !== undefined && rawVal !== "" && !(Array.isArray(rawVal) && rawVal.length === 0);
    case "equals":
      if (typeof rawVal === 'object' && rawVal !== null && "start" in rawVal) {
        const startStr = rawVal.start ? new Date(rawVal.start).toISOString().split('T')[0] : "";
        const endStr = rawVal.end ? new Date(rawVal.end).toISOString().split('T')[0] : "";
        return startStr === rule.value || endStr === rule.value;
      }
      return String(rawVal ?? "").toLowerCase() === String(rule.value).toLowerCase();
    case "not_equals":
      if (typeof rawVal === 'object' && rawVal !== null && "start" in rawVal) {
        const startStr = rawVal.start ? new Date(rawVal.start).toISOString().split('T')[0] : "";
        const endStr = rawVal.end ? new Date(rawVal.end).toISOString().split('T')[0] : "";
        return startStr !== rule.value && endStr !== rule.value;
      }
      return String(rawVal ?? "").toLowerCase() !== String(rule.value).toLowerCase();
    case "contains": {
      let valStr = String(rawVal ?? "");
      if (typeof rawVal === 'object' && rawVal !== null && "start" in rawVal) {
        valStr = `${rawVal.start} ${rawVal.end}`;
      }
      return valStr.toLowerCase().includes(String(rule.value).toLowerCase());
    }
    case "not_contains": {
      let valStr = String(rawVal ?? "");
      if (typeof rawVal === 'object' && rawVal !== null && "start" in rawVal) {
        valStr = `${rawVal.start} ${rawVal.end}`;
      }
      return !valStr.toLowerCase().includes(String(rule.value).toLowerCase());
    }
    case "is_before": {
      if (!rule.value) return true;
      if (typeof rawVal === 'object' && rawVal !== null && "start" in rawVal) {
        if (!rawVal.end && !rawVal.start) return false;
        return new Date(rawVal.end || rawVal.start) < new Date(String(rule.value));
      }
      return new Date(String(rawVal ?? "")) < new Date(String(rule.value));
    }
    case "is_after": {
      if (!rule.value) return true;
      if (typeof rawVal === 'object' && rawVal !== null && "start" in rawVal) {
        if (!rawVal.start && !rawVal.end) return false;
        return new Date(rawVal.start || rawVal.end) > new Date(String(rule.value));
      }
      return new Date(String(rawVal ?? "")) > new Date(String(rule.value));
    }
    case "greater_than":
      return parseFloat(String(rawVal ?? 0)) > parseFloat(String(rule.value));
    case "less_than":
      return parseFloat(String(rawVal ?? 0)) < parseFloat(String(rule.value));
    default:
      return true;
  }
}

function getCellSortValue(item: Item, columnId: string): string | number {
  if (columnId === "__name__") return item.name || "";
  const val = item.column_values?.[columnId];
  if (val === null || val === undefined) return "";
  if (typeof val === "number") return val;
  
  if (typeof val === "object") {
    // Handle timeline/date objects
    if ("start" in val && val.start) return new Date(val.start).getTime();
    if ("end" in val && val.end) return new Date(val.end).getTime();
    return "";
  }
  
  if (typeof val === "string") {
    // Don't auto-parse all strings to floats if they look like strings with numbers in them,
    // but try to parse pure numeric strings. Wait, parseFloat("2024-01-01") returns 2024, 
    // which messes up string sorts for dates.
    // Let's just return lowercase string for strings.
    return val.toLowerCase();
  }
  if (Array.isArray(val)) return val.length;
  return String(val);
}

function compareSortValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}
