"use client";

import React, { useState, useRef, useEffect } from "react";
import { Column } from "@/types";
import { GripVertical, Pencil, Trash2, X, Check } from "lucide-react";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";

interface ColumnHeaderProps {
  column: Column;
  /** Drag handle props from the parent Draggable wrapper */
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  onRename: (columnId: string, newTitle: string) => void;
  onDelete: (columnId: string) => void;
}

export default function ColumnHeader({
  column,
  dragHandleProps,
  onRename,
  onDelete,
}: ColumnHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(column.title);
  const [isRenaming, setIsRenaming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync rename value if column title changes externally
  useEffect(() => {
    setRenameValue(column.title);
  }, [column.title]);

  // Focus the input when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  // Click-outside to close
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setIsRenaming(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== column.title) {
      onRename(column.id, trimmed);
    }
    setIsRenaming(false);
    setMenuOpen(false);
  };

  const handleDelete = () => {
    setMenuOpen(false);
    setIsRenaming(false);
    onDelete(column.id);
  };

  const widthMap: Record<string, string> = {
    text: "w-48",
    people: "w-36",
    timeline: "w-48",
    tags: "w-48",
    priority: "w-36",
    files: "w-40",
    dependency: "w-48",
  };
  const widthClass = widthMap[column.type] || "w-32";

  return (
    <div
      className={`${widthClass} border-r border-gray-200 dark:border-slate-600 shrink-0 relative group/colheader bg-white dark:bg-slate-900`}
      ref={menuRef}
    >
      <div className="flex items-center justify-center h-full p-2">
        {/* Drag handle — appears on hover */}
        <div
          {...dragHandleProps}
          className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/colheader:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={12} className="text-gray-300" />
        </div>

        {/* Column title — clickable to open menu */}
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          {column.title}
        </button>
      </div>

      {/* Context menu */}
      {menuOpen && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-52 bg-white dark:bg-slate-900 shadow-xl rounded-lg border border-gray-200 dark:border-slate-700 py-2 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {isRenaming ? (
            /* Rename input mode */
            <div className="px-3 py-1">
              <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-1.5">Rename Column</div>
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") { setIsRenaming(false); setRenameValue(column.title); }
                  }}
                  className="flex-1 text-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleRename}
                  className="p-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => { setIsRenaming(false); setRenameValue(column.title); }}
                  className="p-1.5 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            /* Default menu */
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
                className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Pencil size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                Rename Column
              </button>
              <div className="border-t border-gray-100 dark:border-slate-800 my-1"></div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                className="flex items-center w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={14} className="mr-2.5" />
                Delete Column
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
