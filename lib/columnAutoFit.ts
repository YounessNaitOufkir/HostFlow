/**
 * The width a column needs to show its widest content, for double-click
 * auto-fit on the header's resize handle (the Google Sheets gesture).
 *
 * Measured from the data rather than the DOM, so rows in collapsed groups or
 * hidden by a filter count too: the width does not change with the view.
 * Each type adds its own cell's padding and chrome, taken from the cell
 * components, on top of the measured text.
 */

import type { Column, Item, Profile } from "@/types";
import { formatColumnNumber } from "@/lib/numberFormat";
import { parseDateOnly, endDateOf, startDateOf } from "@/lib/gantt/dates";
import { format, type Locale } from "date-fns";

export const MIN_COLUMN_WIDTH = 60;
export const MAX_COLUMN_WIDTH = 480;
export const MIN_NAME_WIDTH = 150;
export const MAX_NAME_WIDTH = 800;

/** Width in px of `text` in the app font at this size and weight. */
export type MeasureText = (text: string, sizePx: number, weight?: number) => number;

export interface FitEnv {
  measure: MeasureText;
  locale: Locale;
  bcp47: string;
  /** Translates a status or priority label the way the cells display it. */
  statusLabel: (label: string) => string;
  priorityLabel: (label: string) => string;
  profiles: Profile[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.ceil(n)));

/** The header: title plus the grip and padding around it. */
function headerWidth(title: string, env: FitEnv): number {
  return env.measure(title, 14, 500) + 56;
}

function contentWidth(column: Column, value: unknown, env: FitEnv): number {
  const { measure } = env;
  switch (column.type) {
    case "text":
      return typeof value === "string" && value ? measure(value, 14) + 20 : 0;
    case "link": {
      const v = value as { text?: string; url?: string } | string | null;
      const text = typeof v === "string" ? v : v?.text || v?.url || "";
      return text ? measure(text, 12) + 24 : 0;
    }
    case "numbers": {
      const num = parseFloat(String(value ?? ""));
      return isNaN(num) ? 0 : measure(formatColumnNumber(num, column, env.bcp47), 14) + 20;
    }
    case "status":
      return typeof value === "string" && value && value !== "Empty" ? measure(env.statusLabel(value), 13) + 28 : 0;
    case "priority": {
      if (typeof value !== "string" || !value || value === "Empty") return 0;
      const icon = value === "Critical" || value === "Critique" ? 20 : 0;
      return measure(env.priorityLabel(value), 14) + icon + 28;
    }
    case "date": {
      const d = parseDateOnly(value);
      return d ? measure(d.toLocaleDateString(env.bcp47, { month: "short", day: "numeric" }), 12, 500) + 64 : 0;
    }
    case "timeline": {
      const s = startDateOf(value);
      const e = endDateOf(value) ?? s;
      if (!s || !e) return 0;
      const a = format(s, "MMM d", { locale: env.locale });
      const b = format(e, "MMM d", { locale: env.locale });
      const text = a === b ? a : `${a} – ${b}`;
      // The pill is 88% of the cell and letter-spaced.
      return (measure(text, 12, 700) + text.length * 0.3 + 22) / 0.88 + 10;
    }
    case "people": {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      if (ids.length === 0) return 0;
      const known = ids.filter((id) => env.profiles.some((p) => p.id === id)).length;
      const shown = Math.min(known, 3);
      const extras = (known > 3 ? 1 : 0) + (ids.length > known ? 1 : 0);
      const avatars = shown + extras;
      return avatars > 0 ? 28 + (avatars - 1) * 20 + 16 : 0;
    }
    case "tags": {
      const tags = Array.isArray(value) ? (value as string[]) : [];
      if (tags.length === 0) return 0;
      const chips = tags.map((tag) => Math.min(140, measure(tag, 13) + 30));
      return chips.reduce((a, b) => a + b, 0) + (tags.length - 1) * 4 + 18;
    }
    case "files": {
      const files = Array.isArray(value) ? value.length : 0;
      return files > 0 ? files * 26 + 24 : 0;
    }
    case "rating": {
      const max = Number(column.settings?.ratingMax) || 5;
      return max * 22 + 12;
    }
    default:
      return 0;
  }
}

/** The width a column needs, between MIN_COLUMN_WIDTH and MAX_COLUMN_WIDTH. */
export function fitColumnWidth(column: Column, title: string, items: Item[], env: FitEnv): number {
  let widest = headerWidth(title, env);
  for (const item of items) {
    widest = Math.max(widest, contentWidth(column, item.column_values?.[column.id], env));
  }
  return clamp(widest, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
}

/** The item name column: the longest name plus the padding and the updates icon. */
export function fitNameWidth(title: string, items: Item[], env: FitEnv): number {
  let widest = env.measure(title, 14, 600) + 56;
  for (const item of items) widest = Math.max(widest, env.measure(item.name || "", 14) + 54);
  return clamp(widest, MIN_NAME_WIDTH, MAX_NAME_WIDTH);
}

/** Canvas-backed measurer using the page's own font. Browser only. */
export function createTextMeasurer(): MeasureText {
  const ctx = document.createElement("canvas").getContext("2d");
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  return (text, sizePx, weight = 400) => {
    if (!ctx) return text.length * sizePx * 0.55;
    ctx.font = `${weight} ${sizePx}px ${family}`;
    return ctx.measureText(text).width;
  };
}
