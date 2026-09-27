"use client";

import React, { useState } from "react";
import { Check, ChevronDown, Users } from "lucide-react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { useT } from "@/components/LanguageProvider";
import { Avatar } from "@/components/ui/Avatar";
import { personColor } from "@/lib/personColor";
import type { Profile } from "@/types";

interface PersonFilterProps {
  /** Team members to choose from. */
  people: Profile[];
  /** Open tasks per person across the portfolio. */
  openCounts: Map<string, number>;
  value: string | null;
  onChange: (personId: string | null) => void;
}

/**
 * "Whose tasks": everyone, or one team member's plate across every apartment.
 * People with nothing open stay listed but quiet, so the list does not
 * reshuffle as work is finished.
 */
export function PersonFilter({ people, openCounts, value, onChange }: PersonFilterProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(open, {
    align: "left",
    onDismiss: () => setOpen(false),
  });
  const selected = people.find((p) => p.id === value) ?? null;

  const pick = (id: string | null) => {
    setOpen(false);
    onChange(id);
  };

  return (
    <div className="relative" ref={anchorRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg border text-[13px] font-semibold transition-colors ${
          selected
            ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-200 hover:border-gray-300"
        }`}
      >
        {selected ? (
          <Avatar
            name={selected.full_name}
            initials={selected.avatar_initials}
            url={selected.avatar_url}
            color={personColor(selected)}
            size={20}
            title={null}
          />
        ) : (
          <Users size={16} className="text-gray-500 dark:text-gray-400" aria-hidden />
        )}
        <span className="text-gray-500 dark:text-gray-400 font-medium">{t("portfolio.show")}</span>
        {selected ? selected.full_name : t("portfolio.everyone")}
        <ChevronDown size={14} className="opacity-60" aria-hidden />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={menuStyle}
          role="listbox"
          aria-label={t("portfolio.show")}
          className="w-64 max-h-[60vh] overflow-y-auto p-1.5 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-lg shadow-xl z-[60]"
        >
          <Option selected={value === null} onPick={() => pick(null)}>
            <span className="w-6 h-6 rounded-full grid place-items-center bg-gray-100 dark:bg-slate-700 shrink-0">
              <Users size={13} className="text-gray-500 dark:text-gray-300" aria-hidden />
            </span>
            <span className="flex-1 truncate">{t("portfolio.everyone")}</span>
          </Option>
          <div className="h-px bg-gray-100 dark:bg-[#2d3555] mx-2 my-1" />
          {people.map((person) => {
            const count = openCounts.get(person.id) ?? 0;
            return (
              <Option key={person.id} selected={value === person.id} onPick={() => pick(person.id)} quiet={count === 0}>
                <Avatar
                  name={person.full_name}
                  initials={person.avatar_initials}
                  url={person.avatar_url}
                  color={personColor(person)}
                  size={24}
                  title={null}
                />
                <span className="flex-1 truncate">{person.full_name}</span>
                <span className="text-[11.5px] tabular-nums text-gray-400 dark:text-gray-500">
                  {t("portfolio.openCount", { count })}
                </span>
              </Option>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Option({
  selected,
  quiet = false,
  onPick,
  children,
}: {
  selected: boolean;
  quiet?: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-[13px] transition-colors ${
        selected
          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold"
          : `hover:bg-gray-50 dark:hover:bg-[#252a3f] ${quiet ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-200"}`
      }`}
    >
      {children}
      {selected && <Check size={13} strokeWidth={3} className="shrink-0" aria-hidden />}
    </button>
  );
}
