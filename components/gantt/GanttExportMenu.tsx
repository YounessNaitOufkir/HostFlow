"use client";

import React, { useState } from "react";
import { Download, FileImage, FileSpreadsheet, FileText, Printer, Loader2 } from "lucide-react";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";

export type GanttExportKind = "png" | "pdf" | "print" | "csv" | "xlsx";

interface GanttExportMenuProps {
  onExport: (kind: GanttExportKind) => Promise<void> | void;
  disabled?: boolean;
}

const OPTIONS: {
  kind: GanttExportKind;
  label: string;
  hint: string;
  Icon: typeof FileImage;
}[] = [
  { kind: "pdf", label: "PDF", hint: "Paginated, task list on every page", Icon: FileText },
  { kind: "png", label: "PNG image", hint: "The whole chart, at 2× scale", Icon: FileImage },
  { kind: "print", label: "Print…", hint: "Opens the full chart ready to print", Icon: Printer },
  { kind: "xlsx", label: "Excel", hint: "Dates, duration, float and predecessors", Icon: FileSpreadsheet },
  { kind: "csv", label: "CSV", hint: "The same table as plain text", Icon: FileSpreadsheet },
];

/**
 * A Gantt earns its keep by being shown to people outside the app — a client, a
 * contractor, a lender. Until now there was no way to get one out of here at all.
 */
export function GanttExportMenu({ onExport, disabled }: GanttExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<GanttExportKind | null>(null);
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(open, {
    align: "right",
    // Kept open while an export is running, so a stray click cannot make it
    // look as though nothing is happening.
    onDismiss: () => { if (!busy) setOpen(false); },
  });

  const run = async (kind: GanttExportKind) => {
    setBusy(kind);
    try {
      await onExport(kind);
      setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative" ref={anchorRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors text-sm font-medium text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Export or print this chart"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin text-gray-500 dark:text-gray-400" />
        ) : (
          <Download size={14} className="text-gray-500 dark:text-gray-400" />
        )}
        Export
      </button>

      {open && (
        <div
          ref={menuRef}
          style={menuStyle}
          className="w-64 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-lg z-[60] overflow-hidden p-1.5"
        >
          {OPTIONS.map(({ kind, label, hint, Icon }) => (
            <button
              key={kind}
              type="button"
              onClick={() => run(kind)}
              disabled={busy !== null}
              className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors disabled:opacity-50"
            >
              {busy === kind ? (
                <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-blue-500" />
              ) : (
                <Icon size={14} className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500" />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  {label}
                </span>
                <span className="block text-[11px] text-gray-400 dark:text-gray-500">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
