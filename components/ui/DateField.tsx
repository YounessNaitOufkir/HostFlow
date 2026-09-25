"use client";

import React from "react";
import { Calendar } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import DatePopover from "@/components/ui/DatePopover";
import { formatDateValue, type DateValue } from "@/components/ui/DateCalendar";

interface DateFieldProps {
  mode: "single" | "range";
  value: DateValue;
  onChange: (value: DateValue) => void;
  /** Range only: allow "from X" or "until Y" with the other end left open. */
  openEnded?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
}

/** A form field that opens the shared calendar, for filters and settings. */
export default function DateField({ mode, value, onChange, openEnded, placeholder, ariaLabel, size = "md" }: DateFieldProps) {
  const { t, dateLocale } = useLanguage();
  const label = formatDateValue(value, mode, dateLocale, t);

  return (
    <DatePopover
      mode={mode}
      value={value}
      onCommit={onChange}
      openEnded={openEnded}
      ariaLabel={ariaLabel ?? placeholder}
      className={`w-full flex items-center gap-2 rounded border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 hover:border-gray-300 dark:hover:border-slate-600 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500 ${
        size === "sm" ? "px-2 py-1 text-[11px]" : "px-2 py-1.5 text-sm"
      }`}
    >
      <Calendar size={size === "sm" ? 12 : 14} className="shrink-0 text-gray-400" aria-hidden />
      <span className={`truncate ${label ? "text-gray-700 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}`}>
        {label ?? placeholder ?? t(mode === "range" ? "date.pickRange" : "date.pick")}
      </span>
    </DatePopover>
  );
}
