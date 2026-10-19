"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { format } from "date-fns";
import { useLanguage } from "@/components/LanguageProvider";
import { NO_CLOSURES, closedReasonsOn, placesForTags, type ClosedReason, type Closures } from "@/lib/closures";
import { addDaysOnly } from "@/lib/gantt/dates";
import type { Place } from "@/types";

/**
 * The places and holidays, loaded once by the app shell (useClosuresQuery) and
 * shared down. Outside it - a test, a standalone view - there are none, and
 * every date picker behaves exactly as it did before closed days existed.
 */
const ClosuresContext = createContext<Closures>(NO_CLOSURES);
export const ClosuresProvider = ClosuresContext.Provider;

/** Any Sunday: day `n` of the week is this plus n days. */
const A_SUNDAY = new Date(2026, 9, 18);
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

export interface CalendarClosures {
  /** Why the day is shut for this task, or null when it is open. */
  closedOn: (date: Date) => string | null;
  /** One line per place, e.g. "Banque · fermé sam., dim., jours fériés". */
  legend: string[];
}

/** The words for closures in the current language. Everything that decides is in lib/closures.ts. */
export function useClosureText() {
  const { t, dateLocale } = useLanguage();

  const weekdayName = useCallback(
    (weekday: number, pattern: "EEE" | "EEEE") =>
      format(addDaysOnly(A_SUNDAY, weekday), pattern, { locale: dateLocale }),
    [dateLocale]
  );

  /** "Banque · closed on Saturday 24 Oct" or "Banque · closed for Fête du Trône". */
  const reasonText = useCallback(
    (reason: ClosedReason, date: Date) =>
      reason.kind === "weekday"
        ? t("closed.weekday", { place: reason.place.name, day: format(date, "EEEE d MMM", { locale: dateLocale }) })
        : t("closed.holiday", { place: reason.place.name, holiday: reason.holiday.name }),
    [t, dateLocale]
  );

  const legendFor = useCallback(
    (places: Place[]) =>
      places.map((place) => {
        const days = MONDAY_FIRST.filter((d) => place.closed_weekdays.includes(d)).map((d) => weekdayName(d, "EEE"));
        if (place.closed_on_holidays) days.push(t("closed.holidays"));
        return t("closed.legend", { place: place.name, days: days.join(", ") });
      }),
    [t, weekdayName]
  );

  /** "Mon 26 Oct", for the move button. */
  const dayLabel = useCallback((date: Date) => format(date, "EEE d MMM", { locale: dateLocale }), [dateLocale]);

  return useMemo(
    () => ({ weekdayName, reasonText, legendFor, dayLabel }),
    [weekdayName, reasonText, legendFor, dayLabel]
  );
}

export function useClosures() {
  const closures = useContext(ClosuresContext);
  const text = useClosureText();
  const { reasonText, legendFor } = text;

  /** What the date picker should mark for a task with these tags; undefined when nothing applies. */
  const calendarFor = useCallback(
    (tags: string[]): CalendarClosures | undefined => {
      const places = placesForTags(tags, closures.places);
      if (places.length === 0) return undefined;
      return {
        closedOn: (date) => {
          const reasons = closedReasonsOn(date, places, closures.holidays);
          return reasons.length ? reasonText(reasons[0], date) : null;
        },
        legend: legendFor(places),
      };
    },
    [closures, reasonText, legendFor]
  );

  return useMemo(() => ({ closures, calendarFor, ...text }), [closures, calendarFor, text]);
}
