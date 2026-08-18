"use client";

import React, { useState, useEffect } from "react";
import { X, Folder, ArrowRight, Save, AlignLeft } from "lucide-react";
import type { Board, Group, Profile, Item } from "@/types";
import CellRenderer from "@/components/cells/CellRenderer";
import { TruncatedText } from "@/components/ui/TruncatedText";

interface TaskCreateModalProps {
  board: Board;
  groups: Group[];
  profiles: Profile[];
  items: Item[];
  onClose: () => void;
  onTaskCreate: (groupId: string, name: string, columnValues: Record<string, any>) => Promise<void>;
}

export default function TaskCreateModal({
  board,
  groups,
  profiles,
  items,
  onClose,
  onTaskCreate,
}: TaskCreateModalProps) {
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [columnValues, setColumnValues] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);
  
  // Dummy item to pass to CellRenderer
  const dummyItem: Item = {
    id: "new-item",
    name: name,
    group_id: groupId,
    board_id: board.id,
    column_values: columnValues,
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || !groupId) return;
    setIsSubmitting(true);
    await onTaskCreate(groupId, name.trim(), columnValues);
    setIsSubmitting(false);
  };

  const handleUpdateDummyCell = (itemId: string, columnId: string, value: any) => {
    setColumnValues(prev => ({ ...prev, [columnId]: value }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center sm:items-start justify-center p-4 overflow-y-auto custom-scrollbar">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>
      
      {/* Modal Content */}
      <div 
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col animate-in fade-in zoom-in-95 duration-200 my-auto sm:my-12 h-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-slate-800 relative bg-gray-50/50 dark:bg-slate-800/30">
            <button 
              type="button"
              onClick={onClose} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X size={20} />
            </button>
            <input
              autoFocus
              type="text"
              placeholder="New Task Name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="text-xl font-bold text-slate-800 dark:text-white pr-8 mb-2 leading-tight bg-transparent border-none focus:outline-none focus:ring-0 placeholder:text-gray-300 dark:placeholder:text-gray-600 w-full"
              required
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              in <ArrowRight size={14} className="opacity-70" /> {board.name}
            </p>
          </div>
          
          {/* Body */}
          <div className="px-6 py-4 overflow-visible space-y-4 flex-1">
            
            {/* Built-in Group Row */}
            <div className="grid grid-cols-12 gap-4 items-center group min-h-[32px]">
              <div className="col-span-4 flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Folder size={16} className="text-yellow-500 shrink-0" />
                <span className="text-sm font-medium truncate">Group</span>
              </div>
              <div className="col-span-8 flex items-center justify-center bg-gray-50 dark:bg-slate-800/50 min-h-[36px] rounded p-1">
                <select
                  value={groupId}
                  onChange={e => setGroupId(e.target.value)}
                  className="w-full h-full bg-transparent text-[13px] text-gray-800 dark:text-gray-200 focus:outline-none text-center cursor-pointer font-medium"
                >
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dynamic Columns */}
            {board.columns.map(col => {
              const isColActive = activeStatusId && activeStatusId.includes(col.id);
              return (
              <div key={col.id} className={`grid grid-cols-12 gap-4 items-center group min-h-[32px] ${isColActive ? "relative z-50" : "relative z-0"}`}>
                <div className="col-span-4 flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <AlignLeft size={16} className="text-gray-400 shrink-0" />
                  <TruncatedText className="text-sm font-medium truncate">{col.title}</TruncatedText>
                </div>
                <div 
                  className="col-span-8 flex items-center bg-gray-50 dark:bg-slate-800/50 min-h-[36px] rounded group-hover:bg-gray-100 dark:group-hover:bg-slate-800 transition-colors cursor-pointer"
                  onClick={(e) => {
                    // Only forward if clicking on the background container itself
                    if (e.target === e.currentTarget || (e.target as HTMLElement).parentElement === e.currentTarget) {
                      const clickable = e.currentTarget.querySelector('.cursor-pointer, input, button') as HTMLElement;
                      if (clickable) {
                        if (clickable.tagName === 'INPUT') {
                          clickable.focus();
                        } else {
                          clickable.click();
                        }
                      }
                    }
                  }}
                >
                  <div className="w-full h-[36px] flex pointer-events-none [&>*]:pointer-events-auto [&>div]:!w-full [&>div]:!border-none">
                    <CellRenderer
                      item={dummyItem}
                      column={col}
                      activeStatusId={activeStatusId}
                      setActiveStatusId={setActiveStatusId}
                      onUpdate={handleUpdateDummyCell}
                      profiles={profiles}
                      boardItems={items}
                      columns={board.columns}
                    />
                  </div>
                </div>
              </div>
            )})}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || !groupId || isSubmitting}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              <Save size={16} />
              {isSubmitting ? "Creating..." : "Create Task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
