"use client";

import React, { useState, useEffect, useRef } from "react";
import { Lock, Users } from "lucide-react";

export interface WorkspaceDraft {
  name: string;
  isPrivate: boolean;
}

interface WorkspaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (draft: WorkspaceDraft) => void;
}

/**
 * Name and visibility in one dialog.
 *
 * This replaces a two-step flow: the styled name prompt, then a native
 * window.confirm() asking whether the workspace should be private. That confirm
 * was unstyleable, so creating a workspace flashed two different design
 * languages in a row — and its buttons lied. "Cancel" only decided is_private;
 * the workspace was created either way, so anyone who read it as "stop" got a
 * shared workspace instead of none.
 *
 * Both visibility options are shown with their consequence rather than one
 * being inferred from declining the other, and they sit side by side so the
 * whole form stays about as tall as the single name prompt it replaces.
 */
export default function WorkspaceDialog({ isOpen, onClose, onSubmit }: WorkspaceDialogProps) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setIsPrivate(true);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = name.trim().length > 0;
  const submit = () => {
    if (canSubmit) onSubmit({ name: name.trim(), isPrivate });
  };

  const options = [
    {
      value: true,
      label: "Private",
      hint: "Only you and people you invite",
      Icon: Lock,
      tone: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/15",
    },
    {
      value: false,
      label: "Shared",
      hint: "Anyone on the team can open it",
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
        className="relative w-full max-w-md bg-white dark:bg-[#0e111a]/80 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          // Enter submits from the name field, but not while a visibility card
          // has focus - there it already means "choose this option", and would
          // otherwise select and create in the same keystroke.
          const onButton = (e.target as HTMLElement)?.tagName === "BUTTON";
          if (e.key === "Enter" && canSubmit && !onButton) submit();
        }}
      >
        {/* Glowing top border, matching PromptModal */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />

        <div className="p-6 space-y-5">
          <h3
            id="workspace-dialog-title"
            className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight"
          >
            New workspace
          </h3>

          <div className="space-y-2">
            <label
              htmlFor="workspace-name"
              className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400"
            >
              Name
            </label>
            <input
              id="workspace-name"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all shadow-inner"
              placeholder="e.g. App Z"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
              Visibility
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
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-white/5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md disabled:opacity-50 disabled:shadow-none transition-all"
          >
            Create workspace
          </button>
        </div>
      </div>
    </div>
  );
}
