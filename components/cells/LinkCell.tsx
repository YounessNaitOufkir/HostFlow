"use client";

import React, { useState, useRef, useEffect } from "react";
import { Item, Column } from "@/types";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { safeExternalUrl } from "@/lib/sanitize";
import { ExternalLink, Link2 } from "lucide-react";

interface LinkCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function LinkCell({ item, column, onUpdate }: LinkCellProps) {
  const raw = item.column_values?.[column.id];
  // Support both string URLs and {url, label} objects
  const value: { url: string; label?: string } | null =
    raw === null || raw === undefined || raw === ""
      ? null
      : typeof raw === "string"
      ? { url: raw, label: "" }
      : raw;

  const [isEditing, setIsEditing] = useState(false);
  const [tempUrl, setTempUrl] = useState(value?.url || "");
  const [tempLabel, setTempLabel] = useState(value?.label || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    if (!tempUrl.trim()) {
      onUpdate(item.id, column.id, null);
    } else {
      onUpdate(item.id, column.id, { url: tempUrl.trim(), label: tempLabel.trim() || undefined });
    }
  };

  // Resolved rather than used raw: new URL(value.url) threw during render for a
  // schemeless string like "example.com" and took the board view with it, and the
  // raw value went straight into href, so "javascript:..." was clickable. A link
  // that resolves to nothing navigable renders as plain text.
  const safeLink = safeExternalUrl(value?.url);

  if (isEditing) {
    return (
      <div className={`${column.width ? '' : 'w-48'} border-r border-gray-200 dark:border-slate-700 shrink-0 flex items-center p-1 relative z-10`} style={{ width: column.width ? `${column.width}px` : undefined }}>
        <div className="flex flex-col gap-1 w-full bg-white dark:bg-slate-800 rounded shadow-lg p-1.5 border border-blue-500">
          <input
            ref={inputRef}
            type="url"
            value={tempUrl}
            onChange={(e) => setTempUrl(e.target.value)}
            placeholder="https://..."
            className="w-full text-xs border border-gray-300 dark:border-slate-600 rounded px-1.5 py-1 bg-transparent text-gray-700 dark:text-gray-200 outline-none"
          />
          <input
            type="text"
            value={tempLabel}
            onChange={(e) => setTempLabel(e.target.value)}
            placeholder="Display text (optional)"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="w-full text-xs border border-gray-300 dark:border-slate-600 rounded px-1.5 py-1 bg-transparent text-gray-700 dark:text-gray-200 outline-none"
          />
          <button onClick={handleSave} className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded self-end">
            ✓
          </button>
        </div>
        <div className="fixed inset-0 z-[-1]" onClick={handleSave} />
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        setTempUrl(value?.url || "");
        setTempLabel(value?.label || "");
        setIsEditing(true);
      }}
      className={`${column.width ? '' : 'w-48'} border-r border-gray-200 dark:border-slate-700 shrink-0 flex items-center justify-center p-1.5 cursor-pointer transition-colors`} style={{ width: column.width ? `${column.width}px` : undefined }}
    >
      {value?.url ? (
        <div className="flex items-center gap-1.5 max-w-full">
          <a
            href={safeLink.href ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => (safeLink.href ? e.stopPropagation() : e.preventDefault())}
            className={`text-xs truncate flex items-center gap-1 ${
              safeLink.href
                ? "text-blue-600 dark:text-blue-400 hover:underline"
                : "text-gray-500 dark:text-gray-400 cursor-default"
            }`}
          >
            <ExternalLink size={11} className="shrink-0" />
            <TruncatedText className="truncate" tooltip={value.url}>
              {value.label || safeLink.host}
            </TruncatedText>
          </a>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <Link2 size={14} className="text-gray-400" />
        </div>
      )}
    </div>
  );
}
