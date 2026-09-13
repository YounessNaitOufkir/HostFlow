"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Lock,
  Users,
  Check,
  ListChecks,
  LayoutGrid,
  Plus,
  ArrowLeft,
} from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { BOARD_TEMPLATES, type TemplateId } from "@/lib/boardTemplates";

/** Either a template to start from, or "skip the board and let me import one". */
export type StartWith = { kind: "template"; templateId: TemplateId } | { kind: "import" };

export interface WorkspaceDraft {
  name: string;
  isPrivate: boolean;
  startWith: StartWith;
}

interface WorkspaceDialogProps {
  isOpen: boolean;
  /**
   * Whether this account may create a SHARED workspace. Mirrors the
   * "Workspaces: Insert" RLS policy, which allows a non-private workspace only
   * for company staff. False hides the choice rather than showing an option the
   * database would reject.
   */
  canCreateShared: boolean;
  onClose: () => void;
  onSubmit: (draft: WorkspaceDraft) => void;
}

/** Icon and tint per template. Kept out of lib/boardTemplates.ts so that module
 *  stays free of React and can be used from anywhere. */
const TEMPLATE_LOOK: Record<TemplateId, { Icon: typeof Lock; tone: string }> = {
  project: { Icon: ListChecks, tone: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-400/15" },
  client: { Icon: Users, tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-400/15" },
  personal: { Icon: LayoutGrid, tone: "text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-400/15" },
  blank: { Icon: Plus, tone: "text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-white/10" },
};

/**
 * Two steps: name and visibility, then a starting point for the first board.
 *
 * The name step replaces an older flow of a styled prompt followed by a native
 * window.confirm() for visibility, whose "Cancel" only decided is_private — the
 * workspace was created either way, so anyone who read it as "stop" got a
 * shared workspace instead of none.
 *
 * The second step exists because a workspace with no boards in it is the same
 * dead end the app used to drop every new account into. Creating the workspace
 * and its first board together means the first thing someone sees is a board
 * with work on it.
 */
export default function WorkspaceDialog({
  isOpen,
  canCreateShared,
  onClose,
  onSubmit,
}: WorkspaceDialogProps) {
  const t = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [templateId, setTemplateId] = useState<TemplateId>("project");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(1);
      setName("");
      setIsPrivate(true);
      setTemplateId("project");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmed = name.trim();
  const canAdvance = trimmed.length > 0;
  const submit = () => {
    if (canAdvance) onSubmit({ name: trimmed, isPrivate, startWith: { kind: "template", templateId } });
  };
  const submitImportInstead = () => {
    if (canAdvance) onSubmit({ name: trimmed, isPrivate, startWith: { kind: "import" } });
  };

  const options = [
    {
      value: true,
      label: t("wsdlg.private"),
      hint: t("wsdlg.privateHint"),
      Icon: Lock,
      tone: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/15",
    },
    {
      value: false,
      label: t("wsdlg.shared"),
      hint: t("wsdlg.sharedHint"),
      Icon: Users,
      tone: "text-teal-600 dark:text-teal-300 bg-teal-100 dark:bg-teal-400/15",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-dialog-title"
    >
      <div
        className="absolute inset-0 bg-slate-900/20 dark:bg-slate-950/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      <div
        className={`relative w-full ${step === 1 ? "max-w-md" : "max-w-2xl"} bg-white dark:bg-[#0e111a]/80 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]`}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          // Enter advances from the name field, but not while a card has focus -
          // there it already means "choose this option", and would otherwise
          // select and move on in the same keystroke.
          const onButton = (e.target as HTMLElement)?.tagName === "BUTTON";
          if (e.key === "Enter" && canAdvance && !onButton) {
            if (step === 1) setStep(2);
            else submit();
          }
        }}
      >
        {/* Glowing top border, matching PromptModal */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />

        {/* Step rail */}
        <div className="flex items-center gap-2 px-6 pt-5">
          <StepChip n={1} label={t("tpl.step.name")} state={step === 1 ? "on" : "done"} />
          <span className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
          <StepChip n={2} label={t("tpl.step.start")} state={step === 2 ? "on" : "todo"} />
        </div>

        {step === 1 ? (
          <div className="p-6 space-y-5">
            <h3
              id="workspace-dialog-title"
              className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight"
            >
              {t("wsdlg.title")}
            </h3>

            <div className="space-y-2">
              <label
                htmlFor="workspace-name"
                className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400"
              >
                {t("wsdlg.name")}
              </label>
              <input
                id="workspace-name"
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all shadow-inner"
                placeholder={t("wsdlg.namePlaceholder")}
              />
            </div>

            {!canCreateShared ? (
              <p className="flex items-start gap-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3.5 py-3 text-[12px] leading-snug text-gray-500 dark:text-slate-400">
                <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0 text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/15">
                  <Lock size={14} />
                </span>
                <span className="pt-1">{t("wsdlg.privateOnlyNote")}</span>
              </p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                  {t("wsdlg.visibility")}
                </legend>
                <div className="grid grid-cols-2 gap-2.5">
                  {options.map(({ value, label, hint, Icon, tone }) => {
                    const selected = isPrivate === value;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setIsPrivate(value)}
                        aria-pressed={selected}
                        className={`text-left rounded-xl border-[1.5px] p-3 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                          selected
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15"
                            : "border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:border-blue-300 dark:hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${tone}`}>
                            <Icon size={14} />
                          </span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {label}
                          </span>
                          <span
                            aria-hidden="true"
                            className={`ml-auto w-3.5 h-3.5 rounded-full border-[1.5px] grid place-items-center shrink-0 ${
                              selected ? "border-blue-500" : "border-gray-300 dark:border-white/20"
                            }`}
                          >
                            {selected && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                          </span>
                        </div>
                        <span className="block text-[12px] leading-snug text-balance text-gray-500 dark:text-slate-400">
                          {hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </div>
        ) : (
          <div className="p-6 pb-4 overflow-y-auto">
            <h3
              id="workspace-dialog-title"
              className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight"
            >
              {t("tpl.heading", { name: trimmed })}
            </h3>
            <p className="mt-1 text-[13px] text-gray-500 dark:text-slate-400">
              {t("tpl.subheading")}
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {BOARD_TEMPLATES.map((tpl) => {
                const { Icon, tone } = TEMPLATE_LOOK[tpl.id];
                const selected = templateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setTemplateId(tpl.id)}
                    aria-pressed={selected}
                    className={`text-left rounded-xl border-[1.5px] p-3 flex flex-col gap-1.5 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                      selected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15"
                        : tpl.id === "blank"
                          ? "border-dashed border-gray-300 dark:border-white/15 hover:border-blue-300 dark:hover:border-white/25"
                          : "border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:border-blue-300 dark:hover:border-white/20"
                    }`}
                  >
                    <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${tone}`}>
                      <Icon size={14} />
                    </span>
                    <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">
                      {t(tpl.nameKey)}
                    </span>
                    <span className="text-[11.5px] leading-snug text-gray-500 dark:text-slate-400">
                      {t(tpl.descKey)}
                    </span>
                    <span className="flex flex-wrap gap-1 mt-0.5">
                      {tpl.chips.map((chip) => (
                        <span
                          key={chip}
                          className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-gray-200/70 dark:bg-white/10 text-gray-600 dark:text-slate-300"
                        >
                          {t(chip)}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-white/5 flex justify-between items-center gap-3 flex-wrap">
          {step === 2 ? (
            <button
              type="button"
              onClick={submitImportInstead}
              className="text-[12px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t("tpl.importHint")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3 ml-auto">
            <button
              onClick={step === 1 ? onClose : () => setStep(1)}
              className="px-5 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 transition-colors inline-flex items-center gap-1.5"
            >
              {step === 2 && <ArrowLeft size={14} />}
              {step === 1 ? t("common.cancel") : t("tpl.back")}
            </button>
            <button
              onClick={step === 1 ? () => setStep(2) : submit}
              disabled={!canAdvance}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md disabled:opacity-50 disabled:shadow-none transition-all"
            >
              {step === 1 ? t("common.next") : t("ws.create")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepChip({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state: "todo" | "on" | "done";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
        state === "todo" ? "text-gray-400 dark:text-slate-500" : "text-gray-900 dark:text-white"
      }`}
    >
      <span
        className={`w-[18px] h-[18px] rounded-full grid place-items-center text-[9.5px] font-bold ${
          state === "on"
            ? "bg-blue-600 text-white"
            : state === "done"
              ? "bg-[#00c875] text-white"
              : "bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-slate-400"
        }`}
      >
        {state === "done" ? <Check size={10} strokeWidth={3} /> : n}
      </span>
      {label}
    </span>
  );
}
