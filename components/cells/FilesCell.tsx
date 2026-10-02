"use client";

import React, { useState, useRef } from "react";
import { Item, Column } from "@/types";
import { FileText, Loader2, Paperclip, Plus, X } from "lucide-react";
import { reportMutationError } from "@/lib/errorReporting";
import { attachmentDisplayName, attachmentPathOf, isImageAttachment } from "@/lib/attachments";
import { uploadAttachment, useSignedAttachmentUrls } from "@/hooks/useAttachments";

interface FilesCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

// How many files the cell shows before summing up the rest as "+N".
const SHOWN = 3;

/**
 * A task's attached files. The value is a list of stored attachment URLs
 * (lib/attachments.ts): the bucket is private, so each is signed on display
 * and only people who can open this board can see the files.
 */
export default function FilesCell({ item, column, onUpdate }: FilesCellProps) {
  const files: string[] = Array.isArray(item.column_values?.[column.id])
    ? item.column_values[column.id].filter((f: unknown): f is string => typeof f === "string")
    : [];

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const entries = files.map((url) => {
    const path = attachmentPathOf(url);
    return { url, path, name: path ? attachmentDisplayName(path) : url.split("/").pop() || url };
  });
  const signed = useSignedAttachmentUrls(entries.flatMap((e) => (e.path ? [e.path] : [])));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setIsUploading(true);
    const added: string[] = [];
    try {
      for (const file of picked) {
        const uploaded = await uploadAttachment(file, item.board_id);
        added.push(uploaded.storedUrl);
      }
    } catch (err) {
      reportMutationError(err, "File upload failed", { table: "storage", operation: "upload" });
    } finally {
      // Whatever did upload is kept, even if a later file failed.
      if (added.length > 0) onUpdate(item.id, column.id, [...files, ...added]);
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openFile = (e: React.MouseEvent, entry: (typeof entries)[number]) => {
    e.stopPropagation();
    const href = (entry.path && signed[entry.path]) || null;
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  };

  const removeFile = (e: React.MouseEvent, indexToRemove: number) => {
    e.stopPropagation();
    onUpdate(item.id, column.id, files.filter((_, idx) => idx !== indexToRemove));
  };

  const pick = () => fileInputRef.current?.click();

  return (
    // Stays a div: each attached file below carries its own buttons, which a
    // <button> could not contain. role="button" + tabIndex + onKeyDown makes
    // the cell itself the keyboard-operable "add files" widget.
    <div
      role="button"
      tabIndex={0}
      aria-label={column.title}
      className={`${column.width ? "" : "w-40"} border-r border-gray-200 dark:border-slate-700 shrink-0 flex items-center gap-1 px-1.5 relative group overflow-hidden cursor-pointer transition-colors`}
      style={{ width: column.width ? `${column.width}px` : undefined }}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      }}
    >
      <input type="file" multiple ref={fileInputRef} onChange={handleUpload} className="hidden" />

      {entries.length === 0 && !isUploading && (
        <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="p-1 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-slate-700 dark:hover:text-gray-200 transition-colors">
            <Paperclip size={16} />
          </div>
        </div>
      )}

      {entries.slice(0, SHOWN).map((entry, idx) => {
        const href = entry.path ? signed[entry.path] : undefined;
        const isImage = isImageAttachment(entry.path ?? entry.url);
        return (
          <div key={`${entry.url}-${idx}`} className="relative group/file shrink min-w-0">
            <button
              type="button"
              onClick={(e) => openFile(e, entry)}
              title={entry.name}
              className={
                isImage
                  ? "block w-8 h-8 rounded-md overflow-hidden border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 shrink-0"
                  : "flex items-center gap-1 h-7 max-w-[120px] px-1.5 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-[11px] text-gray-600 dark:text-gray-300"
              }
            >
              {isImage ? (
                href ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
                  <img src={href} alt={entry.name} className="w-full h-full object-cover" />
                ) : (
                  <Paperclip size={12} className="m-auto text-gray-400" />
                )
              ) : (
                <>
                  <FileText size={12} className="shrink-0 text-gray-400" />
                  <span className="truncate">{entry.name}</span>
                </>
              )}
            </button>
            <button
              type="button"
              aria-label={`Remove ${entry.name}`}
              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover/file:opacity-100 focus:opacity-100 flex items-center justify-center transition-opacity hover:bg-red-600"
              onClick={(e) => removeFile(e, idx)}
            >
              <X size={10} />
            </button>
          </div>
        );
      })}

      {entries.length > SHOWN && (
        <span
          className="shrink-0 h-7 px-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-[11px] font-medium text-gray-500 dark:text-gray-400 flex items-center"
          title={entries.slice(SHOWN).map((e) => e.name).join("\n")}
        >
          +{entries.length - SHOWN}
        </span>
      )}

      {isUploading ? (
        <Loader2 size={16} className="shrink-0 animate-spin text-blue-500 mx-auto" />
      ) : (
        entries.length > 0 && (
          <Plus size={14} className="shrink-0 ml-auto text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        )
      )}
    </div>
  );
}
