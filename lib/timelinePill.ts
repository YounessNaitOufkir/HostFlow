import { format, type Locale } from "date-fns";
import { parseDateOnly, today } from "@/lib/gantt/dates";

/**
 * How a timeline value reads as a pill: its label and its colour.
 *
 * Shared by the board's TimelineCell and My Work so the two never disagree
 * about what "late" looks like.
 */
export interface TimelinePill {
  text: string;
  bg: string;
}

export function timelinePill(
  value: { start?: unknown; end?: unknown } | null | undefined,
  finished: boolean,
  locale?: Locale
): TimelinePill | null {
  const start = parseDateOnly(value?.start);
  const end = parseDateOnly(value?.end) ?? start;
  if (!start || !end) return null;

  const [s, e] = end < start ? [end, start] : [start, end];
  const formattedStart = format(s, "MMM d", { locale });
  const formattedEnd = format(e, "MMM d", { locale });
  // A range inside one month repeats the month for no reason: "Feb 20 – 22"
  // is shorter and no less clear. Width matters in the narrow Cards column.
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  const text =
    formattedStart === formattedEnd
      ? formattedStart
      : sameMonth
        ? `${formattedStart} – ${format(e, "d", { locale })}`
        : `${formattedStart} – ${formattedEnd}`;

  // Green is done, whatever the dates - finished early included - so it
  // never also means "not started yet", which is grey.
  const now = today();
  let bg: string;
  if (finished) bg = "bg-[#00c875]";
  else if (e < now) bg = "bg-[#e44258]";
  else if (s <= now) bg = "bg-[#579bfc]";
  else bg = "bg-[#9aa4b8]";

  return { text, bg };
}
