"use client";

import React, { useState, useRef, useEffect } from "react";
import { useT } from "@/components/LanguageProvider";
import { displayColumnTitle } from "@/lib/i18n/labels";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { Column } from "@/types";
import { GripVertical, Pencil, Trash2, X, Check } from "lucide-react";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";

interface ColumnHeaderProps {
  column: Column;
  /** Drag handle props from the parent Draggable wrapper */
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  onRename: (columnId: string, newTitle: string) => void;
  onResize: (columnId: string, width: number) => void;
  onDelete: (columnId: string) => void;
}

export default function ColumnHeader({
  column,
  dragHandleProps,
  onRename,
  onResize,
  onDelete,
}: ColumnHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { anchorRef, menuRef: popupRef, menuStyle } = useAnchoredMenu(menuOpen, { align: 'center' });
  const t = useT();
  // What the header actually reads on screen: a default title such as "Status"
  // renders translated, a title someone chose themselves renders as they wrote it.
  const shownTitle = displayColumnTitle(t, column.title);
  const [renameValue, setRenameValue] = useState(shownTitle);
  const [isRenaming, setIsRenaming] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync rename value if column title changes externally
  useEffect(() => {
    setRenameValue(shownTitle);
  }, [shownTitle]);

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
    if (trimmed && trimmed !== column.title && trimmed !== shownTitle) {
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
  const defaultWidthClass = widthMap[column.type] || "w-32";

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection while dragging
    const startX = e.pageX;
    // We assume default tailwind spacing e.g. w-32 is ~128px
    const startWidth = column.width || parseInt(defaultWidthClass.replace("w-", "")) * 4 || 128;
    setDragWidth(startWidth);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diffX = moveEvent.pageX - startX;
      let newWidth = startWidth + diffX;
      if (newWidth < 60) newWidth = 60; // min width
      setDragWidth(newWidth);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      
      const diffX = upEvent.pageX - startX;
      let newWidth = startWidth + diffX;
      if (newWidth < 60) newWidth = 60;
      if (diffX !== 0) {
        onResize(column.id, newWidth);
      }
      setDragWidth(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };
  
  const activeWidth = dragWidth !== null ? dragWidth : column.width;
  const inlineStyle = activeWidth ? { width: `${activeWidth}px` } : undefined;
  const className = `${activeWidth ? '' : defaultWidthClass} border-r border-gray-200 dark:border-slate-800 shrink-0 relative group/colheader transition-colors duration-100 ${dragWidth !== null ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'bg-transparent'}`;

  return (
    <div
      className={className}
      style={inlineStyle}
      ref={(el) => { menuRef.current = el; anchorRef.current = el; }}
    >
      <div className="flex items-center justify-center h-full p-2 relative">
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
          className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors px-3 min-w-0"
        >
          <TruncatedText className="truncate block">{shownTitle}</TruncatedText>
        </button>

        {/* Resize Handle */}
        <div 
          className={`absolute right-[-3px] top-0 bottom-0 w-[6px] cursor-col-resize z-10 flex items-center justify-center group/resizer`}
          onMouseDown={handleResizeStart}
        >
          <div className={`w-[2px] h-full transition-all duration-150 ${dragWidth !== null ? 'bg-blue-500 opacity-100' : 'bg-gray-300 dark:bg-slate-600 opacity-0 group-hover/colheader:opacity-100 group-hover/resizer:bg-blue-400 group-hover/resizer:w-[3px]'}`} />
        </div>
      </div>

      {/* Context menu */}
      {menuOpen && (
        <div
          ref={popupRef}
          style={menuStyle}
          className="w-52 dropdown-menu py-2 z-[60]"
          onClick={(e) => e.stopPropagation()}
        >
          {isRenaming ? (
            /* Rename input mode */
            <div className="px-3 py-1">
              <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-1.5">{t("col.renameColumn")}</div>
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") { setIsRenaming(false); setRenameValue(shownTitle); }
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
                  onClick={() => { setIsRenaming(false); setRenameValue(shownTitle); }}
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
                {t("col.renameColumn")}
              </button>
              <div className="border-t border-gray-100 dark:border-slate-800 my-1"></div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                className="flex items-center w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={14} className="mr-2.5" />
                {t("col.deleteColumn")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
