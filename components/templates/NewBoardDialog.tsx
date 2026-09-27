"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { useBoardTemplates } from "@/hooks/useBoardTemplates";
import { BLANK, CompanyTemplatePicker } from "@/components/templates/CompanyTemplatePicker";

interface NewBoardDialogProps {
  canManageTemplates: boolean;
  onClose: () => void;
  /** templateId is null for a blank board. Resolves once the board exists. */
  onCreate: (name: string, templateId: string | null) => Promise<void>;
}

/** A new board in a shared workspace: a name, and a company template or Blank to start from. */
export function NewBoardDialog({ canManageTemplates, onClose, onCreate }: NewBoardDialogProps) {
  const t = useT();
  const { templates, loading } = useBoardTemplates(true);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The first template until one is picked: starting from the company's own
  // plan is the point of this dialog. Blank when there are none. A pick that
  // another admin has since deleted falls back the same way.
  const stillThere = choice === BLANK || templates.some((tpl) => tpl.id === choice);
  const selected = choice && stillThere ? choice : templates[0]?.id ?? BLANK;
  const trimmed = name.trim();

  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onCreate(trimmed, selected === BLANK ? null : selected);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="new-board-title">
      <div className="absolute inset-0 bg-slate-900/20 dark:bg-slate-950/60 backdrop-blur-md" onClick={busy ? undefined : onClose} />
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-[#0e111a]/90 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
          const onButton = (e.target as HTMLElement)?.tagName === "BUTTON";
          if (e.key === "Enter" && !onButton && e.target === inputRef.current) void submit();
        }}
      >
        <div className="p-6 space-y-5 overflow-y-auto">
          <h3 id="new-board-title" className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">
            {t("ctpl.newBoardTitle")}
          </h3>

          <div className="space-y-2">
            <label htmlFor="new-board-name" className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              {t("ctpl.boardName")}
            </label>
            <input
              id="new-board-name"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("ctpl.boardNamePlaceholder")}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">{t("ctpl.startFrom")}</p>
            <CompanyTemplatePicker
              templates={templates}
              loading={loading}
              selected={selected}
              onSelect={setChoice}
              canManage={canManageTemplates}
            />
            {selected !== BLANK && (
              <p className="text-[12px] text-gray-500 dark:text-slate-400">{t("ctpl.datesNote")}</p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-white/5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-white/10"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!trimmed || busy}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md disabled:opacity-50 disabled:shadow-none inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {busy ? t("ctpl.creating") : t("ctpl.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
