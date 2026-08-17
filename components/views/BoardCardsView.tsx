"use client";

import React, { useState } from "react";
import { Plus, MoreVertical, Copy, Trash2, ChevronRight } from "lucide-react";
import type { Group, Item, Column, Profile } from "@/types";
import CellRenderer from "@/components/cells/CellRenderer";
import { TruncatedText } from "@/components/ui/TruncatedText";

export interface BoardCardsViewProps {
  groups: Group[];
  filteredItems: Item[];
  columns: Column[];
  profiles: Profile[];
  onSelectItem: (item: Item) => void;
  onUpdateCell: (itemId: string, columnId: string, value: any) => void;
  onAddItem: (groupId: string, name: string) => void;
  onDeleteItem: (itemId: string) => void;
  onDuplicateItem: (item: Item) => void;
}

export default function BoardCardsView({
  groups,
  filteredItems,
  columns,
  profiles,
  onSelectItem,
  onUpdateCell,
  onAddItem,
  onDeleteItem,
  onDuplicateItem,
}: BoardCardsViewProps) {
  const [newItemNames, setNewItemNames] = useState<Record<string, string>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);

  const handleCreateItem = (groupId: string) => {
    const name = newItemNames[groupId]?.trim();
    if (!name) return;
    onAddItem(groupId, name);
    setNewItemNames((prev) => ({ ...prev, [groupId]: "" }));
  };

  if (groups.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto w-full bg-[#F4F6F8] dark:bg-transparent">
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          No groups found on this board.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto w-full bg-[#F4F6F8] dark:bg-transparent">
      <div className="p-4 sm:p-6 space-y-8 max-w-7xl mx-auto pb-32">
      {groups.map((group) => {
        const groupItems = filteredItems.filter((i) => i.group_id === group.id);

        return (
          <div key={group.id} className="space-y-4">
            {/* Group Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div
                  className="w-3.5 h-3.5 rounded-full shadow-sm shrink-0"
                  style={{ backgroundColor: group.color }}
                />
                <h3
                  className="text-lg font-bold text-gray-900 dark:text-white"
                  style={{ color: group.color }}
                >
                  {group.title}
                </h3>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">
                  {groupItems.length} {groupItems.length === 1 ? "card" : "cards"}
                </span>
              </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {groupItems.map((item) => {
                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectItem(item)}
                    className={`group relative bg-white dark:bg-[#1e2140] border border-gray-200/80 dark:border-slate-700/80 hover:border-blue-500 dark:hover:border-blue-500 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col ${
                      activeStatusId?.startsWith(item.id + '-') ? 'z-50' : 'z-10'
                    }`}
                  >
                    {/* Card Header (Title & Menu) */}
                    <div className="p-4 flex items-start justify-between border-b border-gray-100 dark:border-slate-800/80 bg-gray-50/50 dark:bg-slate-800/30">
                      <h4 className="text-[15px] font-bold text-gray-900 dark:text-white line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors pr-4">
                        <TruncatedText as="span" className="line-clamp-2">{item.name}</TruncatedText>
                      </h4>
                      
                      {/* Menu Button */}
                      <div
                        className="relative shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === item.id ? null : item.id);
                        }}
                      >
                        <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                          <MoreVertical size={16} />
                        </button>
                        {openMenuId === item.id && (
                          <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl py-1.5 z-50">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                onDuplicateItem(item);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center space-x-2"
                            >
                              <Copy size={13} />
                              <span>Duplicate</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                onDeleteItem(item.id);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center space-x-2"
                            >
                              <Trash2 size={13} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Body (Dynamic Properties) */}
                    <div className="flex flex-col">
                      {columns.map((col) => {
                        return (
                          <div key={col.id} className="flex border-b border-gray-100 dark:border-slate-800/50 last:border-0 min-h-[40px]">
                            {/* Property Label */}
                            <div className="w-[35%] max-w-[140px] bg-gray-50/50 dark:bg-slate-800/20 px-4 py-2.5 flex items-center border-r border-gray-100 dark:border-slate-800/50 shrink-0">
                              <TruncatedText className="text-xs font-medium text-gray-500 dark:text-gray-400 line-clamp-2">
                                {col.title}
                              </TruncatedText>
                            </div>
                            {/* Property Value (CellRenderer) */}
                            <div 
                               className="flex-1 flex items-center bg-white dark:bg-[#1e2140] relative group/cell" 
                               onClick={(e) => e.stopPropagation()} // Prevent card click when clicking cells
                            >
                              {/* Override CellRenderer fixed widths using CSS magic within this container */}
                              <div className="w-full h-full flex items-center [&>div]:w-full [&>div]:border-r-0 [&>div]:min-h-[40px] [&>div]:h-full [&>div]:justify-start [&>div]:px-3">
                                <CellRenderer
                                  item={item}
                                  column={col}
                                  activeStatusId={activeStatusId}
                                  setActiveStatusId={setActiveStatusId}
                                  onUpdate={onUpdateCell}
                                  profiles={profiles}
                                  boardItems={filteredItems}
                                  columns={columns}
                                  dropdownDirection="down"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Add New Card Input */}
              <div className="w-full bg-white dark:bg-[#1e2140] border-2 border-dashed border-gray-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-xl p-4 flex flex-col justify-center min-h-[120px] transition-all self-start">
                <div className="flex flex-col space-y-3 w-full">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Add a new item to {group.title}</span>
                  <div className="flex items-center space-x-2 w-full">
                    <input
                      type="text"
                      value={newItemNames[group.id] || ""}
                      onChange={(e) =>
                        setNewItemNames((prev) => ({
                          ...prev,
                          [group.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateItem(group.id);
                      }}
                      placeholder="e.g. New Task..."
                      className="flex-1 min-w-0 w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    <button
                      onClick={() => handleCreateItem(group.id)}
                      disabled={!newItemNames[group.id]?.trim()}
                      className="p-2.5 rounded-lg bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700 transition-all shadow-sm shrink-0"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
