"use client";

import React, { useState } from "react";
import { Check } from "lucide-react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { useT } from "@/components/LanguageProvider";
import { PERSON_PALETTE, automaticColor, chosenColor, personColor } from "@/lib/personColor";

interface PersonColorPickerProps {
  person: { id: string; full_name?: string | null; color?: string | null };
  /** A colour from the palette, or null for the automatic one. */
  onChange: (color: string | null) => void;
  disabled?: boolean;
}

/**
 * The swatch on a person's card in admin settings, opening the palette.
 *
 * Fixed choices rather than a free picker: every colour here was chosen to
 * carry white initials and to stay apart from the group blue and the critical
 * path red. "Automatic" is the colour worked out from the account, which is
 * what everyone has until an administrator chooses.
 */
export function PersonColorPicker({ person, onChange, disabled }: PersonColorPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(open, {
    align: "left",
    onDismiss: () => setOpen(false),
  });
  const current = personColor(person);
  const chosen = chosenColor(person.color);

  const pick = (color: string | null) => {
    setOpen(false);
    if (color !== chosen) onChange(color);
  };

  return (
    <div className="relative" ref={anchorRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-label={t("adm.colorFor", { name: person.full_name ?? "" })}
        title={t("adm.colorHint")}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 hover:border-gray-300 dark:hover:border-slate-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: current }} />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
          {chosen ? t("adm.color") : t("adm.colorAuto")}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          style={menuStyle}
          role="dialog"
          aria-label={t("adm.color")}
          className="w-60 p-3 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-lg shadow-xl z-[160]"
        >
          <div className="grid grid-cols-6 gap-2">
            {PERSON_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => pick(color)}
                aria-pressed={chosen === color}
                aria-label={color}
                className="w-7 h-7 rounded-full flex items-center justify-center ring-offset-2 ring-offset-white dark:ring-offset-[#1e2333] hover:ring-2 hover:ring-gray-300 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                style={{ backgroundColor: color }}
              >
                {chosen === color && <Check size={14} strokeWidth={3} className="text-white" />}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => pick(null)}
            aria-pressed={chosen === null}
            className={`mt-3 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
              chosen === null
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-semibold"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#252a3f]"
            }`}
          >
            <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: automaticColor(person.id) }} />
            {t("adm.colorAuto")}
            {chosen === null && <Check size={13} strokeWidth={3} className="ml-auto" />}
          </button>
        </div>
      )}
    </div>
  );
}
