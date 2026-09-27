"use client";

import React, { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/components/LanguageProvider";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { saveBoardTemplate } from "@/lib/companyTemplates";

interface SaveTemplateDialogProps {
  boardId: string;
  boardName: string;
  onClose: () => void;
}

/**
 * Names a template and saves the board as it is now. Saving under a name in
 * use asks first, and replacing is how a template is updated after the board
 * behind it improved.
 */
export function SaveTemplateDialog({ boardId, boardName, onClose }: SaveTemplateDialogProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [name, setName] = useState(boardName);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const trimmed = name.trim();

  const save = async (replace: boolean) => {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const result = await saveBoardTemplate(boardId, trimmed, replace);
    setBusy(false);
    if (result.ok) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.boardTemplates() });
      toast.success(t("ctpl.saved", { name: trimmed }));
      onClose();
    } else if (result.reason === "taken") {
      setTaken(true);
    } else {
      setError(t("ctpl.saveFailed"));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="save-template-title">
      <div className="absolute inset-0 bg-slate-900/20 dark:bg-slate-950/60 backdrop-blur-md" onClick={busy ? undefined : onClose} />
      <form
        className="relative w-full max-w-md bg-white dark:bg-[#0e111a]/90 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
        onSubmit={(e) => {
          e.preventDefault();
          void save(taken);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
        }}
      >
        <div className="p-6 space-y-4">
          <div>
            <h3 id="save-template-title" className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">
              {t("ctpl.saveTitle")}
            </h3>
            <p className="mt-1 text-[13px] text-gray-500 dark:text-slate-400">{t("ctpl.saveSub")}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="template-name" className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              {t("ctpl.nameLabel")}
            </label>
            <input
              id="template-name"
              ref={inputRef}
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
                setTaken(false);
              }}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <p className="text-[12px] leading-snug text-gray-500 dark:text-slate-400">{t("ctpl.saveKeeps")}</p>

          {taken && (
            <p role="alert" className="rounded-xl bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 px-3.5 py-2.5 text-[12.5px] leading-snug text-amber-800 dark:text-amber-200">
              {t("ctpl.replaceQ", { name: trimmed })}
            </p>
          )}
          {error && (
            <p role="alert" className="text-[12.5px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-white/5 flex justify-end gap-3">
          {taken ? (
            <button
              type="button"
              onClick={() => {
                setTaken(false);
                inputRef.current?.select();
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-white/10"
            >
              {t("ctpl.changeName")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-white/10"
            >
              {t("common.cancel")}
            </button>
          )}
          <button
            type="submit"
            disabled={!trimmed || busy}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md disabled:opacity-50 disabled:shadow-none inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {taken ? t("ctpl.replace") : t("ctpl.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
