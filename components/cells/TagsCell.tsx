"use client";

import React, { useState } from "react";
import { Item, Column } from "@/types";
import { Tag } from "lucide-react";

interface TagsCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  boardItems?: Item[];
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
}

function TagItem({ tag, onRemove }: { tag: string, onRemove?: () => void }) {
  const spanRef = React.useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);

  const handleMouseEnter = () => {
    if (spanRef.current) {
      setIsTruncated(spanRef.current.scrollWidth > spanRef.current.clientWidth);
    }
  };

  return (
    <div className="group/tag relative flex items-center" onMouseEnter={handleMouseEnter}>
      <span ref={spanRef} className="text-[13px] px-2.5 py-0.5 rounded-[4px] truncate max-w-[140px] shrink-0 bg-[#cce5ff] text-[#323338] dark:bg-[#cce5ff]/20 dark:text-[#cce5ff] flex items-center gap-1">
        {tag}
        {onRemove && (
          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 opacity-0 group-hover/tag:opacity-100 transition-opacity ml-1"
          >
            <span className="text-[10px] leading-none mb-[1px]">×</span>
          </button>
        )}
      </span>
      {isTruncated && !onRemove && (
        <div className="absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 z-[200] w-max max-w-[300px] pointer-events-none opacity-0 group-hover/tag:opacity-100 transition-opacity duration-200">
          <div className="bg-[#323338] dark:bg-white text-white dark:text-[#323338] text-[13px] font-medium px-3 py-1.5 rounded shadow-lg whitespace-normal leading-relaxed relative text-center">
            <div className="absolute -bottom-[4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-[#323338] dark:bg-white rotate-45 z-[-1]" />
            {tag}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TagsCell({ item, column, onUpdate, boardItems = [], activeStatusId, setActiveStatusId }: TagsCellProps) {
  // Tags stored as string[]
  const tags: string[] = Array.isArray(item.column_values?.[column.id]) 
    ? item.column_values[column.id] 
    : [];

  const isOpen = activeStatusId === item.id + column.id;
  
  const setIsOpen = (open: boolean) => {
    if (setActiveStatusId) {
      setActiveStatusId(open ? item.id + column.id : null);
    }
  };

  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      return;
    }
    
    // Focus input when opened
    if (inputRef.current) {
      inputRef.current.focus();
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Extract all unique tags from boardItems
  const allUniqueTags = React.useMemo(() => {
    const allTags = new Set<string>();
    boardItems.forEach(i => {
      const itemTags = i.column_values?.[column.id];
      if (Array.isArray(itemTags)) {
        itemTags.forEach(t => allTags.add(t));
      }
    });
    return Array.from(allTags).sort();
  }, [boardItems, column.id]);

  const filteredTags = allUniqueTags.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
  const exactMatchExists = allUniqueTags.some(t => t.toLowerCase() === searchQuery.trim().toLowerCase());
  const showCreateOption = searchQuery.trim().length > 0 && !exactMatchExists;

  const toggleTag = (targetTag: string) => {
    const isRemoving = tags.includes(targetTag);
    const newTags = isRemoving
      ? tags.filter((t) => t !== targetTag)
      : [...tags, targetTag];
    onUpdate(item.id, column.id, newTags);
    if (!isRemoving) {
       setSearchQuery("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.trim().length > 0) {
      // If exact match exists, toggle it. If not, create it.
      const match = allUniqueTags.find(t => t.toLowerCase() === searchQuery.trim().toLowerCase());
      if (match) {
        toggleTag(match);
      } else {
        toggleTag(searchQuery.trim());
      }
      setSearchQuery("");
    }
  };

  return (
    <div
      className={`${column.width ? '' : 'w-48'} border-r border-gray-200 dark:border-slate-700 shrink-0 flex items-center p-2 cursor-pointer transition-colors relative ${isOpen ? "z-50" : ""}`} style={{ width: column.width ? `${column.width}px` : undefined }}
    >
      <div 
        className="w-full h-full flex items-center overflow-x-auto no-scrollbar"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1 items-center">
            {tags.map((tag, idx) => (
              <TagItem key={idx} tag={tag} onRemove={() => toggleTag(tag)} />
            ))}
          </div>
        ) : (
          <div className="w-full text-center text-gray-400 dark:text-gray-500 text-xl pb-1 opacity-0 hover:opacity-100 transition-opacity">
            +
          </div>
        )}
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full mt-1 left-0 w-64 dropdown-menu py-1.5 z-50 shadow-xl border border-gray-100 dark:border-slate-700/60 rounded-lg overflow-hidden bg-white dark:bg-[#1e2333]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 pb-2 mb-1 border-b border-gray-100 dark:border-slate-800">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Create or find labels"
              className="w-full px-2 py-1.5 text-sm border border-blue-400 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-800 dark:text-white"
            />
          </div>
          
          <div className="max-h-60 overflow-y-auto px-1 py-1">
            {showCreateOption && (
              <div
                onClick={() => toggleTag(searchQuery.trim())}
                className="px-3 py-2 text-sm cursor-pointer flex items-center justify-between text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md"
              >
                <span>Create new label <strong>"{searchQuery.trim()}"</strong></span>
                <span className="text-blue-500 text-xs font-semibold">+</span>
              </div>
            )}
            
            {filteredTags.map((tag) => {
              const isSelected = tags.includes(tag);
              return (
                <div
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="px-3 py-2 text-sm cursor-pointer flex items-center transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md group"
                >
                  <div
                    className={`w-4 h-4 rounded-sm mr-3 flex items-center justify-center shrink-0 border transition-colors ${
                      isSelected
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600"
                    }`}
                  >
                    {isSelected && <span className="text-[10px]">✓</span>}
                  </div>
                  <span className="text-[#323338] dark:text-[#cce5ff] truncate">{tag}</span>
                </div>
              );
            })}
            
            {filteredTags.length === 0 && !showCreateOption && (
              <div className="px-3 py-4 text-center text-sm text-gray-400">
                No labels found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
