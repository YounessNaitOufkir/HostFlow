"use client";

import React, { useEffect } from "react";
import { AlertTriangle, ArrowDown } from "lucide-react";
import type { DependencyType } from "@/types";
import { describeDependency } from "@/lib/gantt/linking";
import { useT } from "@/components/LanguageProvider";

export interface CrossWorkspaceLinkRequest {
  type: DependencyType;
  source: { taskName: string; boardName: string; workspaceName: string };
  target: { taskName: string; boardName: string; workspaceName: string };
}

interface CrossWorkspaceLinkDialogProps {
  request: CrossWorkspaceLinkRequest;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation for a dependency that crosses two properties.
 *
 * Inside one workspace a link is unremarkable: the boards are phases of the same
 * property and "travaux waits on the permit" is just how the work runs. Across
 * workspaces it is a different claim - that two separate properties share a
 * constraint - and it has consequences someone dragging a bar will not see:
 * moving work on one property silently moves work on another, possibly on a
 * board the person doing the dragging cannot even open.
 *
 * Worth doing deliberately, never by a stray drag.
 */
export function CrossWorkspaceLinkDialog({
  request,
  onConfirm,
  onCancel,
}: CrossWorkspaceLinkDialogProps) {
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const { source, target } = request;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("gantt.crossTitle")}
    >
      <div
        className="absolute inset-0 bg-slate-900/20 dark:bg-slate-950/60 backdrop-blur-md"
        onClick={onCancel}
      />

      <div className="relative w-full max-w-lg bg-white dark:bg-[#0e111a]/90 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-60" />

        <div className="p-6">
          <div className="flex items-start gap-3 mb-5">
            <span className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-900/25 flex items-center justify-center">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
                {t("gantt.crossTitle")}
              </h3>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">
                {describeDependency(t, request.type, 0)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-white/10 divide-y divide-gray-200 dark:divide-white/10 mb-4">
            <Endpoint {...source} />
            <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 dark:bg-white/5">
              <ArrowDown size={13} className="text-gray-400" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">
                {t("gantt.crossWaits")}
              </span>
            </div>
            <Endpoint {...target} />
          </div>

          <p className="text-[13px] text-gray-600 dark:text-gray-300 leading-relaxed mb-1">
            {t("gantt.crossBody")}
          </p>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">
            {t("gantt.crossCaveat")}
          </p>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-white/10">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors shadow-sm"
          >
            {t("gantt.crossConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Endpoint({
  taskName,
  boardName,
  workspaceName,
}: {
  taskName: string;
  boardName: string;
  workspaceName: string;
}) {
  return (
    <div className="px-4 py-3">
      {/* The property comes first: board names repeat across properties, so
          "Lancement" on its own names nothing. */}
      <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 truncate">
        {workspaceName} › {boardName}
      </div>
      <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
        {taskName}
      </div>
    </div>
  );
}
