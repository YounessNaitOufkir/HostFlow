"use client";

import React, { useRef, useState } from "react";
import { BellRing, Hourglass, X } from "lucide-react";
import type { CellValue, Column, Item, WaitingOnValue } from "@/types";
import { useLanguage } from "@/components/LanguageProvider";
import DatePopover from "@/components/ui/DatePopover";
import { parseDateOnly, toDateOnly, today } from "@/lib/gantt/dates";
import { parseWaitingOn } from "@/lib/mission/fields";

interface WaitingOnCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: CellValue) => void;
}

/**
 * Who a task is waiting on, and when to chase them.
 *
 * Typing a name starts the wait today; erasing it clears the cell. The
 * follow-up date is optional and only offered once there is someone to chase.
 * A malformed stored value reads as empty rather than breaking the row.
 */
export default function WaitingOnCell({ item, column, onUpdate }: WaitingOnCellProps) {
  const { bcp47, t } = useLanguage();
  const value = parseWaitingOn(item.column_values?.[column.id]);
  const storedWho = value?.who ?? "";

  // What is being typed, only while the cell has focus. Outside it the cell
  // shows the stored value, so a colleague's edit appears - but never mid-typing.
  const [draft, setDraft] = useState<string | null>(null);
  const localWho = draft ?? storedWho;
  // What the cell held when entered: leaving it unchanged writes nothing.
  const whoOnFocus = useRef("");

  const save = (next: WaitingOnValue | null) => onUpdate(item.id, column.id, next);

  const commitWho = () => {
    const who = localWho.trim();
    if (who === whoOnFocus.current.trim()) return;
    if (!who) {
      if (value) save(null);
      return;
    }
    save({ who, since: value?.since ?? toDateOnly(today()), followUp: value?.followUp ?? null });
  };

  const followUpDate = parseDateOnly(value?.followUp ?? null);
  const followUpLabel = followUpDate
    ? followUpDate.toLocaleDateString(bcp47, { month: "short", day: "numeric" })
    : null;

  return (
    <div
      className={`${column.width ? "" : "w-48"} group relative border-r border-gray-200 dark:border-slate-700 flex items-center gap-1 px-2 shrink-0`}
      style={{ width: column.width ? `${column.width}px` : undefined }}
    >
      {/* Empty and idle: nothing in the row, a faint hourglass on hover - like the
          Date column's calendar. The "who?" hint only appears once you click in. */}
      {!localWho && draft === null && (
        <Hourglass
          aria-hidden
          size={13}
          className="pointer-events-none absolute left-2 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-60 transition-opacity"
        />
      )}
      <input
        type="text"
        value={localWho}
        placeholder={draft !== null ? t("mission.waiting.whoPlaceholder") : ""}
        aria-label={t("coltype.waiting_on")}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => {
          whoOnFocus.current = storedWho;
          setDraft(storedWho);
        }}
        onBlur={() => {
          commitWho();
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="outline-none bg-transparent min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
      />
      {value && (
        <>
          <DatePopover
            mode="single"
            portal
            value={{ start: value.followUp, end: null }}
            onCommit={(next) => save({ ...value, followUp: next.start ?? null })}
            ariaLabel={t("mission.waiting.followUp")}
            className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] cursor-pointer bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
          >
            <BellRing size={11} className="opacity-70" />
            <span title={t("mission.waiting.followUp")}>{followUpLabel ?? "-"}</span>
          </DatePopover>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(null);
              save(null);
            }}
            className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-0.5 rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-opacity"
            title={t("mission.waiting.clear")}
            aria-label={t("mission.waiting.clear")}
          >
            <X size={11} />
          </button>
        </>
      )}
    </div>
  );
}
