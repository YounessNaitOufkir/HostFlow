"use client";

import React, { useState } from "react";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { durationDays, parseDateOnly, toDateOnly } from "@/lib/gantt/dates";

/** Calendar days as "yyyy-MM-dd". `end` is unused in single mode. */
export interface DateValue {
  start: string | null;
  end: string | null;
}

export const EMPTY_DATE_VALUE: DateValue = { start: null, end: null };

interface DateCalendarProps {
  mode: "single" | "range";
  value: DateValue;
  onChange: (value: DateValue) => void;
  /** Range: the Apply button. Single: called as soon as a day is picked. */
  onApply: (value: DateValue) => void;
  onClear: () => void;
}

/** Stored values can arrive reversed; the calendar always shows them in order. */
export function orderedRange(value: DateValue): { from: Date | null; to: Date | null } {
  const a = parseDateOnly(value.start);
  const b = parseDateOnly(value.end);
  if (a && b && b < a) return { from: b, to: a };
  return { from: a, to: b };
}

const sameDay = (a: Date, b: Date) => toDateOnly(a) === toDateOnly(b);

/**
 * The one date picker every date field uses, modelled on Airbnb's: one month
 * at a time (a range can cross months), a live band while choosing the end, and Start/End boxes that
 * decide which end the next click moves.
 */
export default function DateCalendar({ mode, value, onChange, onApply, onClear }: DateCalendarProps) {
  const { t, dateLocale } = useLanguage();
  const { from, to } = orderedRange(value);
  const [focus, setFocus] = useState<"start" | "end">(from ? "end" : "start");
  const [hover, setHover] = useState<Date | null>(null);
  const [month, setMonth] = useState<Date>(() => from ?? new Date());

  const range = mode === "range";

  // While choosing the end, the hovered day stands in for it so the band follows the pointer.
  const previewEnd = range && from && focus === "end" && hover && hover >= from && (!to || !sameDay(hover, to)) ? hover : null;
  const shownEnd = previewEnd ?? to;
  const hasBand = !!(range && from && shownEnd && !sameDay(from, shownEnd));

  const emit = (next: DateValue) => {
    onChange(next);
    if (!range) onApply(next);
  };

  const handleDayClick = (day: Date) => {
    const iso = toDateOnly(day);
    if (!range) return emit({ start: iso, end: null });
    if (!from || focus === "start") {
      const keepEnd = to && day <= to ? toDateOnly(to) : null;
      emit({ start: iso, end: keepEnd });
      setFocus("end");
      return;
    }
    if (day < from) {
      emit({ start: iso, end: null });
      return;
    }
    emit({ start: toDateOnly(from), end: iso });
  };

  const modifiers = {
    start: (d: Date) => !!from && sameDay(d, from),
    end: (d: Date) => !!to && !previewEnd && sameDay(d, to),
    preview: (d: Date) => !!previewEnd && sameDay(d, previewEnd),
    middle: (d: Date) => hasBand && !!from && !!shownEnd && d > from && d < shownEnd && !sameDay(d, shownEnd),
    bandFrom: (d: Date) => hasBand && !!from && sameDay(d, from),
    bandTo: (d: Date) => hasBand && !!shownEnd && sameDay(d, shownEnd),
  };

  const longDate = (d: Date) => format(d, "d MMM yyyy", { locale: dateLocale });
  const nights = from && to ? durationDays(from, to) : null;

  const title = !range
    ? t("date.selectDate")
    : nights
      ? nights === 1 ? t("date.oneDay") : t("date.days", { count: nights })
      : t("date.selectDates");
  const subtitle = !range
    ? from ? longDate(from) : t("date.pickDate")
    : from && to
      ? `${longDate(from)} – ${longDate(to)}`
      : from ? t("date.pickEnd") : t("date.pickStart");

  const box = (which: "start" | "end", date: Date | null) => {
    const active = range && focus === which;
    return (
      <button
        type="button"
        onClick={() => range && setFocus(which)}
        className={`flex-1 min-w-0 flex items-baseline gap-1.5 text-left rounded-md px-2 py-1 border transition-colors ${
          active
            ? "border-gray-900 dark:border-white ring-1 ring-gray-900 dark:ring-white"
            : "border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-500"
        }`}
      >
        <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {range ? t(which === "start" ? "date.start" : "date.end") : t("date.date")}
        </span>
        {/* No year: the header above already spells out the full range. */}
        <span className={`truncate text-[12px] ${date ? "font-semibold text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}>
          {date ? format(date, "d MMM", { locale: dateLocale }) : "—"}
        </span>
      </button>
    );
  };

  return (
    <div className="w-max max-w-[calc(100vw-16px)] p-4 text-gray-900 dark:text-gray-100">
      {/* w-0 min-w-full: the header takes the calendar's width instead of
          setting it. Otherwise the popup sizes to title + boxes side by side,
          then wraps the boxes and leaves a strip of empty space beside the grid. */}
      <div className="w-0 min-w-full flex flex-wrap items-end justify-between gap-x-5 gap-y-2 mb-3">
        <div className="min-w-0">
          <div className="text-[15px] font-bold leading-tight">{title}</div>
          <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</div>
        </div>
        <div className="flex gap-2 w-full">
          {box("start", from)}
          {range && box("end", to)}
        </div>
      </div>

      <DayPicker
        month={month}
        onMonthChange={setMonth}
        showOutsideDays={false}
        locale={dateLocale}
        onDayClick={handleDayClick}
        onDayMouseEnter={(day) => setHover(day)}
        onDayMouseLeave={() => setHover(null)}
        modifiers={modifiers}
        modifiersClassNames={{
          start: "hf-sel",
          end: "hf-sel",
          preview: "hf-preview",
          middle: "hf-mid",
          bandFrom: "hf-band-from",
          bandTo: "hf-band-to",
          today: "hf-today",
        }}
        components={{
          Chevron: ({ orientation }) =>
            orientation === "left" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />,
        }}
        classNames={{
          root: "hf-cal relative",
          months: "flex gap-6",
          month: "min-w-0",
          month_caption: "h-8 flex items-center justify-center text-[14px] font-semibold capitalize",
          nav: "absolute inset-x-0 top-0 h-8 flex items-center justify-between pointer-events-none",
          button_previous: "pointer-events-auto w-8 h-8 grid place-items-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-gray-900 dark:focus-visible:outline-white",
          button_next: "pointer-events-auto w-8 h-8 grid place-items-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-gray-900 dark:focus-visible:outline-white",
          month_grid: "mt-1.5 border-collapse",
          weekdays: "",
          weekday: "w-[34px] h-7 text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 capitalize",
          week: "",
          day: "hf-day p-0 w-[34px] h-[34px] text-center",
          day_button: "hf-day-btn w-[34px] h-[34px] rounded-full text-[12.5px] font-semibold",
        }}
      />

      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onClear}
          disabled={!from}
          className="text-[13px] font-semibold underline underline-offset-2 text-gray-900 dark:text-gray-100 disabled:opacity-40 disabled:no-underline rounded px-1 -mx-1 hover:bg-gray-100 dark:hover:bg-slate-800"
        >
          {range ? t("date.clear") : t("date.clearOne")}
        </button>
        {range && (
          <button
            type="button"
            onClick={() => onApply(value)}
            className="px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-gray-900 text-white hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition-colors"
          >
            {t("date.apply")}
          </button>
        )}
      </div>
    </div>
  );
}

/** How a value reads on a closed field: "12 Mar – 17 Mar", "From 12 Mar", or null. */
export function formatDateValue(
  value: DateValue,
  mode: "single" | "range",
  locale: import("date-fns").Locale,
  t: (key: "date.from" | "date.until", vars: Record<string, string>) => string
): string | null {
  const short = (d: Date) => format(d, "d MMM", { locale });
  if (mode === "single") {
    const d = parseDateOnly(value.start);
    return d ? short(d) : null;
  }
  const { from, to } = orderedRange(value);
  if (from && to) return sameDay(from, to) ? short(from) : `${short(from)} – ${short(to)}`;
  if (from) return t("date.from", { date: short(from) });
  const until = parseDateOnly(value.end);
  return until ? t("date.until", { date: short(until) }) : null;
}

/** Enter applies, except on a focused day, where it picks that day. */
export function isDayButton(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest(".hf-day");
}
