"use client";

import React, { useState, useRef, useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useAssignablePeople } from "@/components/AssignablePeopleContext";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { Item, Column, Profile } from "@/types";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { Plus, X } from "lucide-react";

interface PeopleCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  profiles: Profile[];
  activeStatusId?: string | null;
  setActiveStatusId?: (id: string | null) => void;
}

export default function PeopleCell({ item, column, onUpdate, profiles, activeStatusId, setActiveStatusId }: PeopleCellProps) {

  const isOpen = activeStatusId === item.id + column.id;
  
  const setIsOpen = (open: boolean) => {
    if (setActiveStatusId) {
      setActiveStatusId(open ? item.id + column.id : null);
    }
  };

  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(isOpen, { align: 'left' });

  const rawValue = item.column_values[column.id];
  const selectedIds: string[] = Array.isArray(rawValue) ? rawValue : [];

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const toggleUser = (userId: string) => {
    const newIds = selectedIds.includes(userId)
      ? selectedIds.filter((id) => id !== userId)
      : [...selectedIds, userId];
    onUpdate(item.id, column.id, newIds);
  };

  const removeUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(item.id, column.id, selectedIds.filter((id) => id !== userId));
  };

  // The picker offers only people who can actually reach this workspace, but
  // still lists anyone already assigned so a wrong assignment can be undone.
  const assignable = useAssignablePeople();
  const pickable = assignable
    ? profiles.filter((u) => assignable.has(u.id) || selectedIds.includes(u.id))
    : profiles;
  const selectedUsers = profiles.filter((u) => selectedIds.includes(u.id));
  // Assignees outside your directory — an external, or someone whose workspace
  // you cannot reach. Without this the cell would render them as unassigned,
  // which reads as "nobody is on this" for work that is in fact assigned.
  const knownIds = new Set(profiles.map((u) => u.id));
  const hiddenCount = selectedIds.filter((id) => !knownIds.has(id)).length;

  return (
    <div className={`${column.width ? '' : 'w-36'} border-r border-gray-200 dark:border-slate-700 flex items-center justify-center px-1 shrink-0 relative`} style={{ width: column.width ? `${column.width}px` : undefined }} ref={anchorRef}>
      {/* Cell display */}
      <div
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className="flex items-center justify-center w-full h-full cursor-pointer group/people"
      >
        {selectedIds.length === 0 ? (
          <div className={`w-7 h-7 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center opacity-40 group-hover/people:opacity-80 transition-opacity shrink-0`}>
            <Plus size={12} className="text-gray-400 dark:text-gray-500" />
          </div>
        ) : (
          <div className="flex items-center -space-x-2">
            {selectedUsers.slice(0, 3).map((user) => (
              <div
                key={user.id}
                title={user.full_name}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white dark:ring-slate-900 relative group/avatar overflow-hidden shrink-0`}
                style={{ backgroundColor: user.color }}
              >
                <Avatar
                  name={user.full_name}
                  initials={user.avatar_initials}
                  url={user.avatar_url}
                  color={user.color}
                  size={28}
                  // The wrapper below already carries the name.
                  title={null}
                  className="absolute inset-0"
                />
                <button
                  onClick={(e) => removeUser(user.id, e)}
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full items-center justify-center text-white hidden group-hover/avatar:flex z-10"
                >
                  <X size={8} />
                </button>
              </div>
            ))}
            {selectedUsers.length > 3 && (
              <div className={`w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300 ring-2 ring-white dark:ring-slate-900 shrink-0`}>
                +{selectedUsers.length - 3}
              </div>
            )}
            {hiddenCount > 0 && (
              <div
                title={
                  hiddenCount === 1
                    ? "Assigned to someone outside your workspace"
                    : `Assigned to ${hiddenCount} people outside your workspace`
                }
                className={`w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-300 ring-2 ring-white dark:ring-slate-900 shrink-0`}
              >
                {hiddenCount === 1 ? "?" : `${hiddenCount}?`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div ref={menuRef} style={menuStyle} className="w-52 dropdown-menu py-1.5 z-[60]">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Assign People
          </div>
          {pickable.map((user) => {
            const isSelected = selectedIds.includes(user.id);
            return (
              <button
                key={user.id}
                onClick={(e) => { e.stopPropagation(); toggleUser(user.id); }}
                className={`flex items-center w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold mr-2.5 shrink-0 overflow-hidden`}
                  style={{ backgroundColor: user.color }}
                >
                  <Avatar
                    name={user.full_name}
                    initials={user.avatar_initials}
                    url={user.avatar_url}
                    color={user.color}
                    size={28}
                  />
                </div>
                <TruncatedText className="text-gray-700 dark:text-gray-200 truncate">{user.full_name}</TruncatedText>
                {isSelected && (
                  <div className="ml-auto w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center shrink-0">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
