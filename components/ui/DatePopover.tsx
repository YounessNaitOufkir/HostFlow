"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import DateCalendar, { EMPTY_DATE_VALUE, isDayButton, orderedRange, type DateValue } from "@/components/ui/DateCalendar";
import { toDateOnly } from "@/lib/gantt/dates";

interface DatePopoverProps {
  mode: "single" | "range";
  value: DateValue;
  onCommit: (value: DateValue) => void;
  /** Range only: keep a start with no end instead of turning it into a one-day range. */
  openEnded?: boolean;
  align?: "left" | "right" | "center";
  /**
   * Render the calendar at the top of the page. Board cells need this: later
   * rows otherwise paint over it. Leave it off inside a menu, whose outside-click
   * check only sees its own DOM children.
   */
  portal?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/** Puts a stored value in order and, unless open-ended, gives a lone start an end. */
export function normalizeDateValue(value: DateValue, mode: "single" | "range", openEnded = false): DateValue {
  if (mode === "single") return { start: value.start, end: null };
  const { from, to } = orderedRange(value);
  if (!from) return openEnded && to ? { start: null, end: toDateOnly(to) } : EMPTY_DATE_VALUE;
  const start = toDateOnly(from);
  return { start, end: to ? toDateOnly(to) : openEnded ? null : start };
}

/**
 * A trigger that opens the shared calendar. The popover is a DOM child of the
 * trigger, so a menu this sits inside still counts clicks on it as inside.
 */
export default function DatePopover({
  mode, value, onCommit, openEnded = false, align = "left", portal = false, ariaLabel, className = "", style, children,
}: DatePopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateValue>(value);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const commit = (next: DateValue) => {
    setOpen(false);
    const clean = normalizeDateValue(next, mode, openEnded);
    const current = normalizeDateValue(value, mode, openEnded);
    if (clean.start !== current.start || clean.end !== current.end) onCommit(clean);
  };

  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(open, {
    align,
    gap: 6,
    onDismiss: () => commit(draftRef.current),
  });

  // Escape cancels this calendar only. Caught on the way down, before the
  // listeners of any menu this sits in, which would otherwise close too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      } else if (e.key === "Enter" && mode === "range" && !isDayButton(e.target) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        e.stopPropagation();
        commit(draftRef.current);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openCalendar = () => {
    setDraft(normalizeDateValue(value, mode, true));
    setOpen(true);
  };

  const calendar = (
        <div
          ref={menuRef}
          style={menuStyle}
          role="dialog"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="z-[150] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl animate-scale-in cursor-default text-left font-normal normal-case tracking-normal"
        >
          <DateCalendar
            mode={mode}
            value={draft}
            onChange={setDraft}
            onApply={commit}
            onClear={() => commit(EMPTY_DATE_VALUE)}
          />
        </div>
  );

  return (
    <div
      ref={anchorRef}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={ariaLabel}
      className={`relative ${open && !portal ? "z-50" : ""} ${className}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        if (!open) openCalendar();
      }}
      onKeyDown={(e) => {
        if (!open && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          e.stopPropagation();
          openCalendar();
        }
      }}
    >
      {children}
      {open && (portal ? createPortal(calendar, document.body) : calendar)}
    </div>
  );
}
