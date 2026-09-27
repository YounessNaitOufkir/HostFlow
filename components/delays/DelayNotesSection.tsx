"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { Profile } from "@/types";
import {
  DELAY_CATEGORY_KEYS,
  unexplainedDays,
  type DelayCategory,
  type DelayNote,
} from "@/lib/delays";
import { DelayNoteForm, type DelayNoteValues } from "./DelayNoteForm";

interface DelayNotesSectionProps {
  /** Days behind (positive) or ahead of (negative) the baseline; null without one. */
  slip: number | null;
  /** Of a late slip, the days late tasks before it pushed onto it: not its own to explain. */
  inherited?: number;
  notes: DelayNote[];
  profiles?: Profile[];
  currentUserId?: string | null;
  onAdd?: (values: DelayNoteValues) => Promise<boolean>;
  onUpdate?: (id: string, values: { days: number; category: DelayCategory; note: string }) => Promise<boolean>;
  onRemove?: (id: string) => Promise<boolean>;
}

const signed = (days: number) => (days > 0 ? `+${days}` : String(days));

/**
 * A task's delays: how far it is from the plan, how much of that is
 * explained, and the notes that explain it. The same block sits in the Gantt
 * popover and in the task panel, so the two never disagree.
 */
export function DelayNotesSection({
  slip,
  inherited = 0,
  notes,
  profiles = [],
  currentUserId,
  onAdd,
  onUpdate,
  onRemove,
}: DelayNotesSectionProps) {
  const { t, dateLocale } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const own = slip !== null && slip > 0 ? Math.max(0, slip - inherited) : slip;
  const open = unexplainedDays(own, notes);
  const direction: "late" | "early" = (slip ?? 0) < 0 ? "early" : "late";
  const authorName = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name ?? t("delay.someone");

  return (
    <div className="space-y-2.5">
      {slip !== null && slip !== 0 && (
        <p className="text-[13px] text-gray-700 dark:text-gray-200">
          <span className={`font-semibold ${slip > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {slip > 0
              ? t(slip === 1 ? "delay.behindOne" : "delay.behind", { days: slip })
              : t(slip === -1 ? "delay.aheadOne" : "delay.ahead", { days: -slip })}
          </span>
          {slip > 0 && inherited > 0 && (
            <span className="text-gray-500 dark:text-gray-400">
              {" · "}
              {t(inherited === 1 ? "delay.inheritedOne" : "delay.inherited", { days: inherited })}
            </span>
          )}
          {open !== 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {" · "}
              {t(Math.abs(open) === 1 ? "delay.unexplainedOne" : "delay.unexplained", { days: Math.abs(open) })}
            </span>
          )}
        </p>
      )}

      {notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((note) =>
            editingId === note.id && onUpdate ? (
              <li key={note.id} className="p-2.5 rounded-lg border border-gray-200 dark:border-slate-600">
                <DelayNoteForm
                  direction={note.days < 0 ? "early" : "late"}
                  initial={{ days: note.days, category: note.category, note: note.note ?? "" }}
                  onCancel={() => setEditingId(null)}
                  onSave={async (values) => {
                    const ok = await onUpdate(note.id, values);
                    if (ok) setEditingId(null);
                    return ok;
                  }}
                />
              </li>
            ) : (
              <li
                key={note.id}
                className="group/note p-2.5 rounded-lg bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700"
              >
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200">
                    {t(DELAY_CATEGORY_KEYS[note.category])}
                  </span>
                  <span
                    className={`text-[12px] font-semibold tabular-nums ${
                      note.days > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {signed(note.days)}
                    {t("gantt.dayUnit")}
                  </span>
                  {note.created_by === currentUserId && (onUpdate || onRemove) && (
                    <span className="ml-auto flex items-center gap-0.5 opacity-60 group-hover/note:opacity-100 focus-within:opacity-100">
                      {onUpdate && (
                        <button
                          type="button"
                          onClick={() => setEditingId(note.id)}
                          aria-label={t("delay.edit")}
                          title={t("delay.edit")}
                          className="p-1 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200 dark:hover:bg-slate-700 dark:hover:text-gray-100"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {onRemove && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(t("delay.confirmDelete"))) void onRemove(note.id);
                          }}
                          aria-label={t("delay.delete")}
                          title={t("delay.delete")}
                          className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-gray-200 dark:hover:bg-slate-700"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {note.note && (
                  <p className="mt-1.5 text-[13px] text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">
                    {note.note}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  {authorName(note.created_by)} · {format(new Date(note.created_at), "d MMM yyyy", { locale: dateLocale })}
                </p>
              </li>
            )
          )}
        </ul>
      )}

      {onAdd &&
        (adding ? (
          <div className="p-2.5 rounded-lg border border-gray-200 dark:border-slate-600">
            <DelayNoteForm
              direction={direction}
              initial={{ days: open !== 0 ? Math.abs(open) : 1 }}
              autoFocus
              onCancel={() => setAdding(false)}
              onSave={async (values) => {
                const ok = await onAdd(values);
                if (ok) setAdding(false);
                return ok;
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-[13px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Plus size={14} />
            {t(direction === "late" ? "delay.addReason" : "delay.addNoteEarly")}
          </button>
        ))}
    </div>
  );
}
