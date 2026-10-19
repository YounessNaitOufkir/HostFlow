"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { Check, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { reportMutationError } from "@/lib/errorReporting";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { useClosuresQuery } from "@/hooks/queries/useGlobalQueries";
import { useClosureText } from "@/hooks/useClosures";
import { useLanguage } from "@/components/LanguageProvider";
import DateField from "@/components/ui/DateField";
import { normalizeTag } from "@/lib/closures";
import { parseDateOnly, toDateOnly } from "@/lib/gantt/dates";
import type { Place, PublicHoliday } from "@/types";

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

const CARD = "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden";
const CARD_HEAD = "px-6 py-3 bg-gray-50/70 dark:bg-slate-800/70 border-b border-gray-200 dark:border-slate-700";
const INPUT =
  "w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-white";
const PRIMARY =
  "px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const SECONDARY =
  "px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors";
const ICON_BUTTON =
  "p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors";

/** "Banque, bank , banque" → ["Banque", "bank"]: one entry per tag, however it is typed. */
function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(",")) {
    const tag = raw.trim().replace(/^#+/, "");
    const key = normalizeTag(tag);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/**
 * Admin Settings › Closed days. Places and public holidays; the rules that use
 * them are in lib/closures.ts. Writes are admin-only in the database too.
 */
export default function ClosuresSettings() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { data, isLoading } = useClosuresQuery();
  const [addingPlace, setAddingPlace] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.closures() });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adm.closuresTitle")}</h3>
        <p className="text-gray-500 mt-1">{t("adm.closuresSub")}</p>
      </div>

      {!isLoading && data && !data.available && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {t("adm.closuresMissing")}
        </div>
      )}

      {/* -- Places ----------------------------------------------- */}
      <section className={CARD} aria-labelledby="closures-places">
        <div className={`${CARD_HEAD} flex items-center justify-between gap-3`}>
          <div>
            <h4 id="closures-places" className="text-sm font-bold text-gray-900 dark:text-white">{t("adm.places")}</h4>
            <p className="text-xs text-gray-500 mt-0.5">{t("adm.placesHint")}</p>
          </div>
          {!addingPlace && (
            <button type="button" onClick={() => setAddingPlace(true)} className={`${SECONDARY} shrink-0 flex items-center gap-1.5`}>
              <Plus size={15} /> {t("adm.addPlace")}
            </button>
          )}
        </div>
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {(data?.places ?? []).map((place) => (
            <PlaceRow key={place.id} place={place} onSaved={refresh} />
          ))}
          {addingPlace && (
            <PlaceRow
              onSaved={() => {
                setAddingPlace(false);
                refresh();
              }}
              onCancel={() => setAddingPlace(false)}
            />
          )}
          {!isLoading && !addingPlace && (data?.places ?? []).length === 0 && (
            <p className="px-6 py-5 text-sm text-gray-500">{t("adm.noPlaces")}</p>
          )}
        </div>
      </section>

      {/* -- Holidays --------------------------------------------- */}
      <HolidaysCard holidays={data?.holidays ?? []} onSaved={refresh} />
    </div>
  );
}

function PlaceRow({ place, onSaved, onCancel }: { place?: Place; onSaved: () => void; onCancel?: () => void }) {
  const { t } = useLanguage();
  const { weekdayName } = useClosureText();
  const [name, setName] = useState(place?.name ?? "");
  const [tagsText, setTagsText] = useState((place?.tags ?? []).join(", "));
  const [weekdays, setWeekdays] = useState<number[]>(place?.closed_weekdays ?? [0, 6]);
  const [holidays, setHolidays] = useState(place?.closed_on_holidays ?? true);
  const [saving, setSaving] = useState(false);

  const tags = parseTags(tagsText);
  const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((d) => b.includes(d));
  const dirty =
    !place ||
    name.trim() !== place.name ||
    tags.join("\u0000") !== place.tags.join("\u0000") ||
    !sameDays(weekdays, place.closed_weekdays) ||
    holidays !== place.closed_on_holidays;
  const valid = name.trim().length > 0 && tags.length > 0;

  const reset = () => {
    if (!place) return onCancel?.();
    setName(place.name);
    setTagsText(place.tags.join(", "));
    setWeekdays(place.closed_weekdays);
    setHolidays(place.closed_on_holidays);
  };

  const save = async () => {
    if (!dirty || !valid) return;
    setSaving(true);
    const row = {
      name: name.trim(),
      tags,
      closed_weekdays: [...weekdays].sort(),
      closed_on_holidays: holidays,
      updated_at: new Date().toISOString(),
    };
    try {
      // An RLS-blocked write returns no error and no rows, so both are checked.
      const { data, error } = place
        ? await supabase.from("places").update(row).eq("id", place.id).select("id")
        : await supabase.from("places").insert(row).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(t("adm.errClosures"));
      setTagsText(tags.join(", "));
      onSaved();
    } catch (err) {
      reportMutationError(err, t("adm.errClosures"), { table: "places" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!place) return;
    const { error } = await supabase.from("places").delete().eq("id", place.id);
    if (error) reportMutationError(error, t("adm.errClosures"), { table: "places", operation: "delete" });
    else onSaved();
  };

  const toggleDay = (day: number) =>
    setWeekdays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));

  return (
    <div className="px-6 py-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] gap-3 items-start">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("adm.placeName")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("adm.newPlace")}
            maxLength={60}
            autoFocus={!place}
            className={INPUT}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("adm.placeTags")}</label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="banque, bank"
            className={INPUT}
          />
          <p className="mt-1 text-[11px] text-gray-500">{t("adm.placeTagsHint")}</p>
        </div>
        {place && (
          <button type="button" onClick={remove} aria-label={t("adm.deletePlace", { name: place.name })} className={`${ICON_BUTTON} sm:mt-6 justify-self-end`}>
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t("adm.closedOn")}</span>
          <div className="flex gap-1" role="group" aria-label={t("adm.closedOn")}>
            {MONDAY_FIRST.map((day) => {
              const on = weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  title={weekdayName(day, "EEEE")}
                  onClick={() => toggleDay(day)}
                  className={`min-w-[38px] px-1.5 py-1 rounded-md text-xs font-semibold capitalize border transition-colors ${
                    on
                      ? "bg-gray-900 border-gray-900 text-white dark:bg-white dark:border-white dark:text-slate-900"
                      : "border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                  }`}
                >
                  {weekdayName(day, "EEE")}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={holidays} onChange={(e) => setHolidays(e.target.checked)} className="rounded border-gray-300" />
          {t("adm.closedOnHolidays")}
        </label>
      </div>

      {dirty && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={saving || !valid} className={PRIMARY}>
            {saving ? t("adm.saving") : t("adm.save")}
          </button>
          <button type="button" onClick={reset} className={SECONDARY}>
            {t("adm.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}

function HolidaysCard({ holidays, onSaved }: { holidays: PublicHoliday[]; onSaved: () => void }) {
  const { t, dateLocale } = useLanguage();
  const [adding, setAdding] = useState(false);

  const yearly = holidays.filter((h) => h.year == null);
  const years = Array.from(new Set(holidays.filter((h) => h.year != null).map((h) => h.year!))).sort((a, b) => a - b);
  const byDate = (a: PublicHoliday, b: PublicHoliday) => a.month - b.month || a.day - b.day;

  // Any leap year, so 29 February has a date to show.
  const dateLabel = (h: PublicHoliday) => format(new Date(h.year ?? 2028, h.month - 1, h.day), "d MMMM", { locale: dateLocale });

  const write = async (op: PromiseLike<{ error: unknown }>, operation: string) => {
    const { error } = await op;
    if (error) reportMutationError(error, t("adm.errClosures"), { table: "public_holidays", operation });
    else onSaved();
  };

  const moveTo = (h: PublicHoliday, iso: string | null) => {
    const d = parseDateOnly(iso);
    if (!d) return;
    void write(
      supabase
        .from("public_holidays")
        .update({ month: d.getMonth() + 1, day: d.getDate(), ...(h.year != null ? { year: d.getFullYear() } : {}) })
        .eq("id", h.id),
      "update"
    );
  };

  const row = (h: PublicHoliday) => (
    <li key={h.id} className="px-6 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0 text-sm text-gray-900 dark:text-white truncate">{h.name}</div>
      {h.estimated && (
        <>
          <span title={t("adm.isEstimated")} className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {t("adm.estimated")}
          </span>
          <button
            type="button"
            onClick={() => void write(supabase.from("public_holidays").update({ estimated: false }).eq("id", h.id), "update")}
            className={`${SECONDARY} shrink-0 flex items-center gap-1 !py-1 text-xs`}
          >
            <Check size={13} /> {t("adm.confirmHoliday")}
          </button>
        </>
      )}
      <div className="w-36 shrink-0">
        <DateField
          mode="single"
          size="sm"
          value={{ start: toDateOnly(new Date(h.year ?? new Date().getFullYear(), h.month - 1, h.day)), end: null }}
          onChange={(v) => moveTo(h, v.start)}
          ariaLabel={`${h.name} · ${dateLabel(h)}`}
        />
      </div>
      <button
        type="button"
        onClick={() => void write(supabase.from("public_holidays").delete().eq("id", h.id), "delete")}
        aria-label={t("adm.deleteHoliday", { name: h.name })}
        className={`${ICON_BUTTON} shrink-0`}
      >
        <Trash2 size={15} />
      </button>
    </li>
  );

  return (
    <section className={CARD} aria-labelledby="closures-holidays">
      <div className={`${CARD_HEAD} flex items-center justify-between gap-3`}>
        <div>
          <h4 id="closures-holidays" className="text-sm font-bold text-gray-900 dark:text-white">{t("adm.holidays")}</h4>
          <p className="text-xs text-gray-500 mt-0.5">{t("adm.holidaysHint")}</p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${SECONDARY} shrink-0 flex items-center gap-1.5`}>
            <Plus size={15} /> {t("adm.addHoliday")}
          </button>
        )}
      </div>

      {adding && <NewHoliday onDone={() => setAdding(false)} onSaved={onSaved} />}

      {yearly.length > 0 && (
        <>
          <h5 className="px-6 pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-gray-500">{t("adm.everyYear")}</h5>
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">{[...yearly].sort(byDate).map(row)}</ul>
        </>
      )}
      {years.map((year) => (
        <React.Fragment key={year}>
          <h5 className="px-6 pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-gray-500">{year}</h5>
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {holidays.filter((h) => h.year === year).sort(byDate).map(row)}
          </ul>
        </React.Fragment>
      ))}
      <div className="h-3" />
    </section>
  );
}

function NewHoliday({ onDone, onSaved }: { onDone: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [yearly, setYearly] = useState(false);
  const [estimated, setEstimated] = useState(false);
  const [saving, setSaving] = useState(false);

  const d = parseDateOnly(date);
  const valid = name.trim().length > 0 && !!d;

  const add = async () => {
    if (!valid || !d) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("public_holidays")
      .insert({
        name: name.trim(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        year: yearly ? null : d.getFullYear(),
        estimated: !yearly && estimated,
      })
      .select("id");
    setSaving(false);
    if (error || !data?.length) {
      reportMutationError(error ?? new Error(t("adm.errClosures")), t("adm.errClosures"), { table: "public_holidays" });
      return;
    }
    onSaved();
    onDone();
  };

  return (
    <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-blue-50/40 dark:bg-slate-900/40 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px] gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("adm.holidayName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("adm.newHoliday")} maxLength={80} autoFocus className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("adm.holidayDate")}</label>
          <DateField mode="single" value={{ start: date, end: null }} onChange={(v) => setDate(v.start)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-700 dark:text-gray-300">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} className="rounded border-gray-300" />
          {t("adm.repeatsYearly")}
        </label>
        {!yearly && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} className="rounded border-gray-300" />
            {t("adm.isEstimated")}
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={add} disabled={saving || !valid} className={PRIMARY}>
          {saving ? t("adm.saving") : t("adm.addHoliday")}
        </button>
        <button type="button" onClick={onDone} className={SECONDARY}>
          {t("adm.cancel")}
        </button>
      </div>
    </div>
  );
}
