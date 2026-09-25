import type { Column } from "@/types";

/** Settings for a Budget column: amounts in Moroccan dirhams. */
export const BUDGET_COLUMN_SETTINGS = { numberFormat: "currency", currencySymbol: "MAD" } as const;

/**
 * A number as its column wants it shown. Currency columns suffix the code
 * ("12 500 MAD") in both languages, which is how amounts are written in Morocco.
 */
export function formatColumnNumber(num: number, column: Pick<Column, "settings">, bcp47: string): string {
  const text = num.toLocaleString(bcp47, { maximumFractionDigits: 2 });
  const settings = column.settings;
  if (settings?.numberFormat === "currency") return `${text} ${settings.currencySymbol || "MAD"}`;
  if (settings?.numberFormat === "percent") return `${text}%`;
  return text;
}
