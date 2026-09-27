"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/components/LanguageProvider";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { deleteBoardTemplate, renameBoardTemplate, type BoardTemplateSummary } from "@/lib/companyTemplates";

/** The Blank option's value, next to the templates' ids. */
export const BLANK = "blank";

interface CompanyTemplatePickerProps {
  templates: BoardTemplateSummary[];
  loading: boolean;
  /** A template id, or BLANK. */
  selected: string;
  onSelect: (id: string) => void;
  /** Admins rename and delete templates from here. */
  canManage: boolean;
}

/**
 * The company's templates, then Blank - the starting points for a board in a
 * shared workspace. Used by the new-workspace dialog and the new-board dialog.
 */
export function CompanyTemplatePicker({ templates, loading, selected, onSelect, canManage }: CompanyTemplatePickerProps) {
  const t = useT();

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {loading && templates.length === 0
          ? [0, 1].map((i) => (
              <div key={i} className="h-[92px] rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse" aria-hidden />
            ))
          : templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                selected={selected === tpl.id}
                onSelect={() => onSelect(tpl.id)}
                onDeleted={() => {
                  if (selected === tpl.id) onSelect(BLANK);
                }}
                canManage={canManage}
              />
            ))}

        <button
          type="button"
          onClick={() => onSelect(BLANK)}
          aria-pressed={selected === BLANK}
          className={`text-left rounded-xl border-[1.5px] p-3 flex flex-col gap-1.5 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
            selected === BLANK
              ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15"
              : "border-dashed border-gray-300 dark:border-white/15 hover:border-blue-300 dark:hover:border-white/25"
          }`}
        >
          <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0 text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-white/10">
            <Plus size={14} />
          </span>
          <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{t("tpl.blank.name")}</span>
          <span className="text-[11.5px] leading-snug text-gray-500 dark:text-slate-400">{t("ctpl.blankDesc")}</span>
        </button>
      </div>

      {!loading && templates.length === 0 && (
        <p className="text-[12px] leading-snug text-gray-500 dark:text-slate-400">{t("ctpl.none")}</p>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
  onDeleted,
  canManage,
}: {
  template: BoardTemplateSummary;
  selected: boolean;
  onSelect: () => void;
  onDeleted: () => void;
  canManage: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"view" | "rename" | "confirmDelete">("view");
  const [draft, setDraft] = useState(template.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tasks = template.task_count === 1 ? t("ctpl.taskCountOne") : t("ctpl.taskCount", { n: template.task_count });
  const groups = template.group_count === 1 ? t("ctpl.groupCountOne") : t("ctpl.groupCount", { n: template.group_count });

  const shell = `relative rounded-xl border-[1.5px] p-3 flex flex-col gap-1.5 transition-all ${
    selected
      ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15"
      : "border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:border-blue-300 dark:hover:border-white/20"
  }`;

  const rename = async () => {
    const name = draft.trim();
    if (!name || name === template.name) {
      setMode("view");
      return;
    }
    setBusy(true);
    const result = await renameBoardTemplate(template.id, name);
    setBusy(false);
    if (result === "ok") {
      setMode("view");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.boardTemplates() });
    } else {
      setError(result === "taken" ? t("ctpl.nameTaken") : t("ctpl.renameFailed"));
    }
  };

  const remove = async () => {
    setBusy(true);
    const ok = await deleteBoardTemplate(template.id);
    setBusy(false);
    if (ok) {
      toast.success(t("ctpl.deleted"));
      onDeleted();
      void queryClient.invalidateQueries({ queryKey: queryKeys.boardTemplates() });
    } else {
      toast.error(t("ctpl.deleteFailed"));
      setMode("view");
    }
  };

  if (mode === "rename") {
    return (
      <div className={shell}>
        <input
          autoFocus
          value={draft}
          maxLength={80}
          aria-label={t("ctpl.nameLabel")}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            // Enter and Escape belong to this field, not to the dialog around it.
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              void rename();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(template.name);
              setError(null);
              setMode("view");
            }
          }}
          className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 px-2.5 py-1.5 text-[13px] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        {error && (
          <p role="alert" className="text-[11.5px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              setDraft(template.name);
              setError(null);
              setMode("view");
            }}
            className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-white/10"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() => void rename()}
            className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "confirmDelete") {
    return (
      <div className={shell}>
        <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight truncate">{template.name}</span>
        <p className="text-[11.5px] leading-snug text-gray-600 dark:text-slate-300">{t("ctpl.deleteConfirm")}</p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            autoFocus
            onClick={() => setMode("view")}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setMode("view");
              }
            }}
            className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-white/10"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50"
          >
            {t("common.delete")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group ${shell}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
      >
        <span className="sr-only">{template.name}</span>
      </button>
      <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0 text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-400/15 pointer-events-none">
        <LayoutTemplate size={14} />
      </span>
      <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight break-words pointer-events-none pr-12">
        {template.name}
      </span>
      <span className="text-[11.5px] leading-snug text-gray-500 dark:text-slate-400 pointer-events-none">
        {tasks} · {groups}
      </span>

      {canManage && (
        <div className="absolute top-2 right-2 flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => {
              setDraft(template.name);
              setMode("rename");
            }}
            aria-label={t("ctpl.renameNamed", { name: template.name })}
            className="relative p-1.5 rounded-md text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => setMode("confirmDelete")}
            aria-label={t("ctpl.deleteNamed", { name: template.name })}
            className="relative p-1.5 rounded-md text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-white/10"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
