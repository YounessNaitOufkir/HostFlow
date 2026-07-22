"use client";

import React, { useMemo } from "react";
import { Item, Column } from "@/types";
import { evaluateFormula, formatFormulaResult } from "@/lib/formulaEngine";
import type { FormulaContext } from "@/lib/formulaEngine";

interface FormulaCellProps {
  item: Item;
  column: Column;
  boardItems: Item[];
  columns: Column[];
}

/**
 * Read-only computed cell that evaluates a formula expression.
 *
 * Formula syntax:
 *   {column_id} + {column_id} * 0.2
 *   IF({priority_col} = "High", {numbers_col} * 1.5, {numbers_col})
 *   BOARD_SUM("board_id", "column_id")
 */
export default function FormulaCell({ item, column, boardItems, columns }: FormulaCellProps) {
  const formula = column.settings?.formula || "";
  const format = column.settings?.numberFormat;
  const currency = column.settings?.currencySymbol;

  const result = useMemo(() => {
    if (!formula) return null;

    const ctx: FormulaContext = {
      item,
      columns,
      boardItems,
    };

    return evaluateFormula(formula, ctx);
  }, [formula, item.column_values, boardItems, columns]);

  const displayValue = formatFormulaResult(result, format, currency);
  const isError = typeof displayValue === "string" && displayValue.startsWith("#ERR:");

  return (
    <div className={`${column.width ? '' : 'w-36'} border-r border-gray-200 dark:border-slate-700 shrink-0 flex items-center justify-center px-2`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      {formula ? (
        <span
          className={`text-sm font-medium truncate ${
            isError
              ? "text-red-500 dark:text-red-400 text-xs"
              : "text-gray-700 dark:text-gray-200"
          }`}
          title={isError ? displayValue : `Formula: ${formula}`}
        >
          {displayValue}
        </span>
      ) : (
        <span className="text-xs text-gray-400 dark:text-gray-500 italic">No formula</span>
      )}
    </div>
  );
}
