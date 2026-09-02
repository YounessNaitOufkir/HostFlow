"use client";

import React, { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { DependencyType } from "@/types";
import type { GanttDependency } from "@/lib/gantt/dependencies";
import {
  clampLag,
  describeDependency,
  SELECTABLE_DEPENDENCY_TYPES,
} from "@/lib/gantt/linking";
import { useT } from "@/components/LanguageProvider";

// The current type is always shown even when it is no longer offered, so a
// link made before start-to-finish was withdrawn can still be read and changed
// rather than sitting there unexplained.
const offeredTypes = (current: DependencyType): DependencyType[] =>
  SELECTABLE_DEPENDENCY_TYPES.includes(current)
    ? SELECTABLE_DEPENDENCY_TYPES
    : [...SELECTABLE_DEPENDENCY_TYPES, current];

interface GanttLinkEditorProps {
  dependency: GanttDependency;
  sourceName: string;
  targetName: string;
  /** Viewport coordinates of the click that opened it. */
  at: { x: number; y: number };
  onChange: (changes: { type?: DependencyType; lag?: number }) => void;
  onDelete: () => void;
  onClose: () => void;
  /** Set when the link only exists on an item's dependency column, which carries no type. */
  readOnly?: boolean;
}

/**
 * The editor for one dependency.
 *
 * The schema and the scheduler have understood link types and lag for a while,
 * but there was nowhere to enter either: every link the product could make was
 * a plain finish-to-start. This is that missing surface — pick the two edges the
 * link joins, and say how many days sit between them.
 */
export function GanttLinkEditor({
  dependency,
  sourceName,
  targetName,
  at,
  onChange,
  onDelete,
  onClose,
  readOnly,
}: GanttLinkEditorProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  // Seeded once. The caller keys this component by link id, so opening a
  // different arrow remounts it rather than needing the field synced back.
  const [lagText, setLagText] = useState(String(dependency.lag));

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Deferred a tick: the click that opened this would otherwise close it.
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", onPointerDown);
    }, 0);
    window.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const commitLag = () => {
    const next = clampLag(Number(lagText));
    setLagText(String(next));
    if (next !== dependency.lag) onChange({ lag: next });
  };

  const types = offeredTypes(dependency.type);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t("gantt.dependency")}
      className="fixed z-[200] w-72 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-lg shadow-xl p-3"
      style={{
        // Clamped so a link near the right or bottom edge still opens on screen.
        left: Math.min(at.x + 8, (typeof window !== "undefined" ? window.innerWidth : 1200) - 300),
        top: Math.min(at.y + 8, (typeof window !== "undefined" ? window.innerHeight : 800) - 260),
      }}
    >
      <div className="flex items-start gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">
            {t("gantt.dependency")}
          </div>
          <div className="text-[13px] text-gray-700 dark:text-gray-200 truncate" title={`${sourceName} → ${targetName}`}>
            <span className="font-medium">{sourceName}</span>
            <span className="text-gray-400 px-1">→</span>
            <span className="font-medium">{targetName}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X size={14} />
        </button>
      </div>

      {readOnly ? (
        <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-snug">
          {t("gantt.linkColumnOnly")}
        </p>
      ) : (
        <>
          <div
            className={`grid gap-1 mb-3 ${
              types.length > 3 ? "grid-cols-4" : "grid-cols-3"
            }`}
            role="group"
            aria-label={t("gantt.dependencyType")}
          >
            {types.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChange({ type: option })}
                aria-pressed={dependency.type === option}
                title={describeDependency(t, option, 0)}
                className={`py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  dependency.type === option
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 dark:bg-[#252a3f] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2d3555]"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
            {describeDependency(t, dependency.type, dependency.lag)}
          </p>

          <label className="flex items-center gap-2 mb-3">
            <span className="text-[12px] text-gray-600 dark:text-gray-300 shrink-0">
              {t("gantt.lag")}
            </span>
            <input
              type="number"
              value={lagText}
              onChange={(e) => setLagText(e.target.value)}
              onBlur={commitLag}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLag();
              }}
              aria-label={t("gantt.lag")}
              className="w-20 px-2 py-1 text-sm rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            {/* Negative lag is an overlap, which is how a plan says two jobs
                share a few days rather than queueing. */}
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {t("gantt.lagHint")}
            </span>
          </label>
        </>
      )}

      <button
        type="button"
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      >
        <Trash2 size={13} />
        {t("gantt.removeDependency")}
      </button>
    </div>
  );
}
