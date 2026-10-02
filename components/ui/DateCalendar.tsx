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
  /** Saves: a range when its end is picked, a single date when it is picked, and Today. */
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
 * The one date picker every date field uses: one compact month at a time (a
 * range can cross months), with a live band while choosing the end.
 *
 * Short on purpose, so it fits on screen without scrolling (DatePopover places
 * it). A range is two clicks: the first is the start, the second the end, and
 * the second saves - there is no Apply step. A single date saves on its click.
 */
export default function DateCalendar({ mode, value, onChange, onApply, onClear }: DateCalendarProps) {
  const { t, dateLocale } = useLanguage();
  const { from, to } = orderedRange(value);
  // Opening always starts a fresh pick: the next click is a start.
  const [focus, setFocus] = useState<"start" | "end">("start");
  const [hover, setHover] = useState<Date | null>(null);
  const [month, setMonth] = useState<Date>(() => from ?? new Date());

  const range = mode === "range";

  // While choosing the end, the hovered day stands in for it so the band follows the pointer.
  const previewEnd = range && from && focus === "end" && hover && hover >= from && (!to || !sameDay(hover, to)) ? hover : null;
  const shownEnd = previewEnd ?? to;
  const hasBand = !!(range && from && shownEnd && !sameDay(from, shownEnd));

  const handleDayClick = (day: Date) => {
    const iso = toDateOnly(day);
    if (!range) {
      const next = { start: iso, end: null };
      onChange(next);
      onApply(next);
      return;
    }
    // A start, or a day before the start: begin the range there.
    if (focus === "start" || !from || day < from) {
      onChange({ start: iso, end: null });
      setFocus("end");
      return;
    }
    // The end: the range is complete, so save it.
    const next = { start: toDateOnly(from), end: iso };
    onChange(next);
    onApply(next);
    setFocus("start");
  };

  const modifiers = {
    start: (d: Date) => !!from && sameDay(d, from),
    end: (d: Date) => !!to && !previewEnd && sameDay(d, to),
    preview: (d: Date) => !!previewEnd && sameDay(d, previewEnd),
    middle: (d: Date) => hasBand && !!from && !!shownEnd && d > from && d < shownEnd && !sameDay(d, shownEnd),
    bandFrom: (d: Date) => hasBand && !!from && sameDay(d, from),
    bandTo: (d: Date) => hasBand && !!shownEnd && sameDay(d, shownEnd),
  };

  const shortDate = (d: Date) => format(d, "d MMM", { locale: dateLocale });
  const days = from && to ? durationDays(from, to) : null;

  const label = !range
    ? from ? format(from, "d MMM yyyy", { locale: dateLocale }) : t("date.selectDate")
    : from && to
      ? sameDay(from, to) ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`
      : from ? `${shortDate(from)} – …` : t("date.selectDates");
  const hint = range
    ? focus === "end" && from ? t("date.pickEnd") : days ? (days === 1 ? t("date.oneDay") : t("date.days", { count: days })) : t("date.pickStart")
    : null;

  const todayValue = (): DateValue => {
    const iso = toDateOnly(new Date());
    return range ? { start: iso, end: iso } : { start: iso, end: null };
  };

  return (
    <div className="w-max max-w-[calc(100vw-16px)] p-3.5 text-gray-900 dark:text-gray-100">
      {/* w-0 min-w-full: the header takes the calendar's width instead of
          setting it, so a long label never widens the popup. */}
      <div className="w-0 min-w-full flex items-baseline justify-between gap-3 mb-1.5 px-0.5">
        <div className="text-[14px] font-bold leading-tight truncate">{label}</div>
        {hint && <div className="shrink-0 text-[11.5px] text-gray-600 dark:text-gray-400">{hint}</div>}
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
          month_caption: "h-8 flex items-center justify-center text-[13.5px] font-semibold capitalize",
          nav: "absolute inset-x-0 top-0 h-8 flex items-center justify-between pointer-events-none",
          button_previous: "pointer-events-auto w-8 h-8 grid place-items-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-gray-900 dark:focus-visible:outline-white",
          button_next: "pointer-events-auto w-8 h-8 grid place-items-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-gray-900 dark:focus-visible:outline-white",
          month_grid: "mt-1 border-collapse",
          weekdays: "",
          weekday: "w-[34px] h-6 text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 capitalize",
          week: "",
          day: "hf-day p-0 w-[34px] h-[34px] text-center",
          day_button: "hf-day-btn w-[34px] h-[34px] rounded-full text-[12.5px] font-semibold",
        }}
      />

      <div className="mt-2 pt-2.5 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onClear}
          disabled={!from}
          className="text-[12.5px] font-semibold underline underline-offset-2 text-gray-900 dark:text-gray-100 disabled:opacity-40 disabled:no-underline rounded px-1 -mx-1 hover:bg-gray-100 dark:hover:bg-slate-800"
        >
          {range ? t("date.clear") : t("date.clearOne")}
        </button>
        {/* One click to "today": a timeline becomes a one-day range on today, a
            date becomes today, and either is saved straight away. */}
        <button
          type="button"
          onClick={() => onApply(todayValue())}
          className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
        >
          {t("date.today")}
        </button>
      </div>
    </div>
  );
}

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
