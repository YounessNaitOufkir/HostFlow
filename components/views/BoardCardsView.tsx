"use client";

import React, { useState } from "react";
import { Plus, MoreVertical, Calendar as CalendarIcon, Users, Tag, Clock, ChevronRight, CheckSquare, Copy, Trash2 } from "lucide-react";
import type { Group, Item, Column, Profile } from "@/types";

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

  const statusColumn = columns.find((c) => c.type === "status");
  const priorityColumn = columns.find((c) => c.type === "priority");
  const personColumn = columns.find((c) => c.type === "person");
  const dateColumn = columns.find((c) => c.type === "date");

  const handleCreateItem = (groupId: string) => {
    const name = newItemNames[groupId]?.trim();
    if (!name) return;
    onAddItem(groupId, name);
    setNewItemNames((prev) => ({ ...prev, [groupId]: "" }));
  };

  const getStatusColor = (val: string) => {
    switch (val?.toLowerCase()) {
      case "done":
        return "bg-emerald-500 text-white";
      case "working on it":
      case "in progress":
        return "bg-amber-500 text-white";
      case "stuck":
        return "bg-rose-500 text-white";
      default:
        return "bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300";
    }
  };

  const getPriorityColor = (val: string) => {
    switch (val?.toLowerCase()) {
      case "critical":
      case "high":
        return "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800";
      case "medium":
        return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
      case "low":
        return "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
      default:
        return "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-slate-700";
    }
  };

  if (groups.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        No groups found on this board.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-7xl mx-auto">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupItems.map((item) => {
                const statusVal = statusColumn ? item.column_values?.[statusColumn.id] || "New" : null;
                const priorityVal = priorityColumn ? item.column_values?.[priorityColumn.id] || "" : null;
                const personVal = personColumn ? item.column_values?.[personColumn.id] : null;
                const dateVal = dateColumn ? item.column_values?.[dateColumn.id] : null;

                // Find profile for assigned person
                const assignedProfile = personVal
                  ? profiles.find((p) => p.id === personVal || p.full_name === personVal || p.email === personVal)
                  : null;

                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectItem(item)}
                    className="group relative bg-white dark:bg-[#1e223d] border border-gray-200/80 dark:border-slate-700/80 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4"
                  >
                    {/* Top Row: Status & Priority Badges + Actions */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                        {statusVal && (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${getStatusColor(
                              statusVal
                            )}`}
                          >
                            {statusVal}
                          </span>
                        )}
                        {priorityVal && (
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${getPriorityColor(
                              priorityVal
                            )}`}
                          >
                            {priorityVal}
                          </span>
                        )}
                      </div>

                      {/* Menu Button */}
                      <div
                        className="relative"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === item.id ? null : item.id);
                        }}
                      >
                        <button className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
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

                    {/* Middle: Title */}
                    <div>
                      <h4 className="text-base font-bold text-gray-900 dark:text-white line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {item.name}
                      </h4>
                    </div>

                    {/* Bottom Row: Metadata & Chevron */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-slate-800/80 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center space-x-3">
                        {/* Person Avatar */}
                        {assignedProfile ? (
                          <div className="flex items-center space-x-1.5" title={assignedProfile.full_name || "Assigned"}>
                            {assignedProfile.avatar_url ? (
                              <img
                                src={assignedProfile.avatar_url}
                                alt=""
                                className="w-5 h-5 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                                {assignedProfile.full_name?.[0]?.toUpperCase() || "U"}
                              </div>
                            )}
                            <span className="truncate max-w-[80px]">
                              {assignedProfile.full_name?.split(" ")[0]}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1 text-gray-400">
                            <Users size={13} />
                            <span>Unassigned</span>
                          </div>
                        )}

                        {/* Date */}
                        {dateVal && (
                          <div className="flex items-center space-x-1">
                            <CalendarIcon size={13} />
                            <span>{dateVal}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center text-blue-600 dark:text-blue-400 font-medium">
                        <span className="text-[11px] opacity-0 group-hover:opacity-100 transition-opacity">
                          Open
                        </span>
                        <ChevronRight size={15} />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add New Card Input Button */}
              <div className="bg-gray-50/70 dark:bg-[#16192d]/70 border border-dashed border-gray-300 dark:border-slate-700/80 rounded-2xl p-4 flex flex-col justify-center min-h-[140px] hover:border-blue-400 dark:hover:border-blue-500 transition-all">
                <div className="flex items-center space-x-2">
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
                    placeholder="Create a new task card..."
                    className="w-full bg-transparent border-0 text-sm font-medium text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleCreateItem(group.id)}
                    disabled={!newItemNames[group.id]?.trim()}
                    className="p-2 rounded-xl bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700 transition-all shadow-sm"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
