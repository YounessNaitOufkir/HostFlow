// ============================================================
// Formula Cell Component
// Supports sum, average, count, min, max operations across items in a group
// ============================================================

"use client";

import React, { useMemo } from "react";
import { Item, Column, FormulaOperation } from "@/types";
import { Calculator } from "lucide-react";

interface FormulaCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  allItems?: Item[]; // Items in the same group for calculation
}

const FORMULA_OPERATIONS: Array<{ value: FormulaOperation; label: string; symbol: string }> = [
  { value: "sum", label: "Sum", symbol: "Σ" },
  { value: "average", label: "Average", symbol: "Ø" },
  { value: "count", label: "Count", symbol: "#" },
  { value: "min", label: "Minimum", symbol: "↓" },
  { value: "max", label: "Maximum", symbol: "↑" },
];

export default function FormulaCell({ item, column, onUpdate, allItems = [] }: FormulaCellProps) {
  const value = item.column_values[column.id];
  const config = column.config;

  // Calculate the formula result
  const result = useMemo(() => {
    if (!config?.formulaSourceColumns?.length || !config?.formulaOperation) {
      return null;
    }

    const { formulaOperation, formulaSourceColumns } = config;
    
    // Collect all numeric values from source columns across all items in the group
    const values: number[] = [];
    
    allItems.forEach((i) => {
      formulaSourceColumns.forEach((colId) => {
        const cellValue = i.column_values[colId];
        if (cellValue != null) {
          if (typeof cellValue === "number") {
            values.push(cellValue);
          } else if (typeof cellValue === "string") {
            const parsed = parseFloat(cellValue);
            if (!isNaN(parsed)) {
              values.push(parsed);
            }
          } else if (Array.isArray(cellValue)) {
            // For arrays, try to parse each element
            cellValue.forEach((el) => {
              const parsed = parseFloat(String(el));
              if (!isNaN(parsed)) {
                values.push(parsed);
              }
            });
          }
        }
      });
    });

    if (values.length === 0) return null;

    switch (formulaOperation) {
      case "sum":
        return values.reduce((a, b) => a + b, 0);
      case "average":
        return values.reduce((a, b) => a + b, 0) / values.length;
      case "count":
        return values.length;
      case "min":
        return Math.min(...values);
      case "max":
        return Math.max(...values);
      default:
        return null;
    }
  }, [allItems, config?.formulaSourceColumns, config?.formulaOperation]);

  // Format the display value
  const displayValue = useMemo(() => {
    if (result === null) return "—";
    
    const decimals = config?.decimalPlaces ?? 2;
    
    if (Number.isInteger(result) && decimals === 0) {
      return result.toLocaleString("en-US");
    }
    
    return result.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }, [result, config?.decimalPlaces]);

  // Get the operation symbol
  const operationSymbol = useMemo(() => {
    const op = FORMULA_OPERATIONS.find((o) => o.value === config?.formulaOperation);
    return op?.symbol || "Σ";
  }, [config?.formulaOperation]);

  // Format prefix/suffix
  const prefix = config?.prefix || "";
  const suffix = config?.suffix || "";

  return (
    <div className="w-32 border-r border-gray-200 dark:border-slate-700 shrink-0 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-center px-2">
      <div className="flex items-center gap-1.5">
        <Calculator size={12} className="text-gray-400 dark:text-gray-500 shrink-0" />
        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase">
          {operationSymbol}
        </span>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {prefix}{displayValue}{suffix}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// Formula Cell Configuration Modal
// For setting up formula columns
// ============================================================

interface FormulaConfigModalProps {
  column: Column;
  availableColumns: Column[];
  onSave: (config: Column["config"]) => void;
  onClose: () => void;
}

export function FormulaConfigModal({ 
  column, 
  availableColumns, 
  onSave, 
  onClose 
}: FormulaConfigModalProps) {
  const [operation, setOperation] = React.useState<FormulaOperation>(
    column.config?.formulaOperation || "sum"
  );
  const [sourceColumns, setSourceColumns] = React.useState<string[]>(
    column.config?.formulaSourceColumns || []
  );
  const [decimalPlaces, setDecimalPlaces] = React.useState(
    column.config?.decimalPlaces ?? 2
  );
  const [prefix, setPrefix] = React.useState(column.config?.prefix || "");
  const [suffix, setSuffix] = React.useState(column.config?.suffix || "");

  // Filter to only numeric columns
  const numericColumns = availableColumns.filter(
    (c) => c.type === "numbers" || c.type === "formula"
  );

  const handleToggleColumn = (colId: string) => {
    setSourceColumns((prev) =>
      prev.includes(colId)
        ? prev.filter((id) => id !== colId)
        : [...prev, colId]
    );
  };

  const handleSave = () => {
    onSave({
      formulaOperation: operation,
      formulaSourceColumns: sourceColumns,
      decimalPlaces,
      prefix,
      suffix,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
          Configure Formula Column
        </h3>

        {/* Operation Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Operation
          </label>
          <div className="grid grid-cols-5 gap-2">
            {FORMULA_OPERATIONS.map((op) => (
              <button
                key={op.value}
                onClick={() => setOperation(op.value)}
                className={`p-3 rounded-lg border text-center transition-all ${
                  operation === op.value
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"
                }`}
                title={op.label}
              >
                <span className="text-xl">{op.symbol}</span>
                <span className="block text-[10px] mt-1">{op.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Source Columns */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Source Columns
          </label>
          {numericColumns.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center border border-dashed border-gray-300 dark:border-slate-700 rounded-lg">
              No numeric columns available. Add Number columns first.
            </p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {numericColumns.map((col) => (
                <label
                  key={col.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={sourceColumns.includes(col.id)}
                    onChange={() => handleToggleColumn(col.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    {col.title}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Display Options */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Decimals
            </label>
            <input
              type="number"
              min="0"
              max="6"
              value={decimalPlaces}
              onChange={(e) => setDecimalPlaces(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Prefix
            </label>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="$"
              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Suffix
            </label>
            <input
              type="text"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              placeholder="%"
              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={sourceColumns.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Formula
          </button>
        </div>
      </div>
    </div>
  );
}
