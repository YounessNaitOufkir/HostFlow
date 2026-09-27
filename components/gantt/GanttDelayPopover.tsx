"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import type { Profile } from "@/types";
import type { DelayCategory, DelayNote } from "@/lib/delays";
import { DelayNotesSection } from "@/components/delays/DelayNotesSection";
import type { DelayNoteValues } from "@/components/delays/DelayNoteForm";

interface GanttDelayPopoverProps {
  taskName: string;
  slip: number | null;
  inherited?: number;
  notes: DelayNote[];
  /** Where the chip was, in viewport pixels. */
  anchor: { left: number; top: number };
  profiles?: Profile[];
  currentUserId?: string | null;
  onAdd?: (values: DelayNoteValues) => Promise<boolean>;
  onUpdate?: (id: string, values: { days: number; category: DelayCategory; note: string }) => Promise<boolean>;
  onRemove?: (id: string) => Promise<boolean>;
  onClose: () => void;
}

const WIDTH = 340;
const MARGIN = 8;

/**
 * A task's delay notes, opened from its "+4d" chip.
 *
 * Fixed to the viewport at the chip rather than inside the chart, whose rows
 * clip and scroll: a form that grows as you type would otherwise be cut off
 * by the row below. Kept on screen at the edges.
 */
export function GanttDelayPopover({
  taskName,
  slip,
  inherited = 0,
  notes,
  anchor,
  profiles,
  currentUserId,
  onAdd,
  onUpdate,
  onRemove,
  onClose,
}: GanttDelayPopoverProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.top);

  // Kept on screen as it grows: opening the form or adding a note makes it
  // taller, and near the bottom of the window it slides up to stay whole.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const height = el.offsetHeight;
      setTop(Math.max(MARGIN, Math.min(anchor.top, window.innerHeight - height - MARGIN)));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor.top]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const left = Math.max(
    MARGIN,
    Math.min(anchor.left, (typeof window === "undefined" ? 1200 : window.innerWidth) - WIDTH - MARGIN)
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t("delay.title")}
      className="fixed z-[150] max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-[#2d3555] bg-white dark:bg-[#1e2333] shadow-2xl p-3.5"
      style={{ left, top, width: WIDTH }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t("delay.title")}
          </div>
          <div className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 truncate">{taskName}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("delay.cancel")}
          className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-700 dark:hover:text-gray-200"
        >
          <X size={16} />
        </button>
      </div>
      <DelayNotesSection
        slip={slip}
        inherited={inherited}
        notes={notes}
        profiles={profiles}
        currentUserId={currentUserId}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </div>
  );
}
