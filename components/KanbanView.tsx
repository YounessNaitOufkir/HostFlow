"use client";

import React, { useState, useEffect, useRef } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { ChevronDown, Columns3 } from "lucide-react";

import { Item, Column, Group, STATUS_OPTIONS, Profile } from "@/types";

// ============================================================
// Helpers
// ============================================================

/** Extract raw hex from Tailwind bg class like "bg-[#fdab3d]" */
function getHexColor(bgClass: string): string {
  const match = bgClass.match(/#[0-9a-fA-F]{6}/);
  return match ? match[0] : "#c4c4c4";
}

// ============================================================
// KanbanView Component
// ============================================================

interface KanbanViewProps {
  columns: Column[];
  groups: Group[];
  items: Item[];
  onUpdateCell: (itemId: string, columnId: string, value: any) => void;
  onSelectItem: (item: Item) => void;
  profiles: Profile[];
}

export default function KanbanView({
  columns,
  groups,
  items,
  onUpdateCell,
  onSelectItem,
  profiles,
}: KanbanViewProps) {
  const statusColumns = columns.filter((c) => c.type === "status");
  const [kanbanColumnId, setKanbanColumnId] = useState<string>("");
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Auto-select first status column (or re-select if the current one was deleted)
  useEffect(() => {
    if (
      statusColumns.length > 0 &&
      (!kanbanColumnId || !statusColumns.find((c) => c.id === kanbanColumnId))
    ) {
      setKanbanColumnId(statusColumns[0].id);
    }
  }, [statusColumns, kanbanColumnId]);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  // ---- Kanban card drag handler ----
  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    // The droppableId IS the new status label
    const newStatus = destination.droppableId;
    onUpdateCell(draggableId, kanbanColumnId, newStatus);
  };

  // ---- No status columns → empty state ----
  if (statusColumns.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 bg-[#f5f6f8] dark:bg-slate-950">
        <Columns3 size={48} className="text-gray-300 mb-4" />
        <h2 className="text-xl font-medium text-gray-700 dark:text-gray-200 mb-2">No status columns</h2>
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          Add a Status column to your board to use the Kanban view.
        </p>
      </div>
    );
  }

  const selectedColumn = statusColumns.find((c) => c.id === kanbanColumnId);

  // Other columns to display as chips on cards (exclude the kanban grouping column, max 3)
  const chipColumns = columns.filter((c) => c.id !== kanbanColumnId).slice(0, 3);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#f5f6f8] dark:bg-slate-950">
      {/* ===== Column Picker ===== */}
      <div className="px-8 py-4 flex items-center gap-3 shrink-0" ref={pickerRef}>
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Group by</span>
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:border-slate-500 transition-colors shadow-sm dark:shadow-none"
          >
            {selectedColumn?.title || "Select column"}
            <ChevronDown size={14} className="text-gray-400 dark:text-gray-500" />
          </button>
          {showPicker && statusColumns.length > 1 && (
            <div className="absolute top-9 left-0 w-48 bg-white dark:bg-slate-900 shadow-xl rounded-lg border border-gray-200 dark:border-slate-600 py-1.5 z-50">
              {statusColumns.map((col) => (
                <button
                  key={col.id}
                  onClick={() => {
                    setKanbanColumnId(col.id);
                    setShowPicker(false);
                  }}
                  className={`flex items-center w-full px-3 py-2 text-sm hover:bg-gray-50 dark:bg-slate-800 transition-colors ${
                    kanbanColumnId === col.id
                      ? "bg-blue-50 text-blue-600 font-medium"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {col.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Kanban Lanes ===== */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-8 pb-8">
          <div className="flex gap-4 h-full min-w-max">
            {STATUS_OPTIONS.map((status) => {
              const hexColor = getHexColor(status.color);

              // Items in this lane
              const laneItems = items.filter((i) => {
                const val = i.column_values?.[kanbanColumnId];
                if (status.label === "Empty") {
                  return !val || val === "" || val === "Empty";
                }
                return val === status.label;
              });

              return (
                <div key={status.label} className="w-[280px] shrink-0 flex flex-col h-full">
                  {/* Lane Header */}
                  <div
                    className="rounded-t-xl px-4 py-2.5 flex items-center justify-between"
                    style={{ backgroundColor: hexColor }}
                  >
                    <span className="text-white text-sm font-semibold">{status.label}</span>
                    <span className="bg-white dark:bg-slate-900/25 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center">
                      {laneItems.length}
                    </span>
                  </div>

                  {/* Lane Body — Droppable */}
                  <Droppable droppableId={status.label}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 rounded-b-xl p-2.5 space-y-2.5 overflow-y-auto kanban-lane transition-colors ${
                          snapshot.isDraggingOver
                            ? "bg-blue-50 ring-2 ring-blue-200 ring-inset"
                            : "bg-gray-100 dark:bg-slate-700/80"
                        }`}
                      >
                        {laneItems.map((item, index) => {
                          const group = groups.find((g) => g.id === item.group_id);
                          return (
                            <Draggable key={item.id} draggableId={item.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`kanban-card bg-white dark:bg-slate-900 rounded-lg p-3.5 cursor-grab active:cursor-grabbing transition-shadow ${
                                    snapshot.isDragging
                                      ? "shadow-xl ring-2 ring-blue-400"
                                      : "shadow-sm dark:shadow-none hover:shadow-md"
                                  }`}
                                  style={{
                                    ...provided.draggableProps.style,
                                    borderLeft: `4px solid ${group?.color || "#c4c4c4"}`,
                                  }}
                                >
                                  {/* Item name — clickable to open panel */}
                                  <div
                                    className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2 cursor-pointer hover:text-blue-600 transition-colors line-clamp-2"
                                    onClick={() => onSelectItem(item)}
                                  >
                                    {item.name}
                                  </div>

                                  {/* Column value chips */}
                                  {chipColumns.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                                      {chipColumns.map((col) => {
                                        const val = item.column_values?.[col.id];
                                        if (val === undefined || val === null || val === "") return null;

                                        // Status chip
                                        if (col.type === "status") {
                                          const opt = STATUS_OPTIONS.find((o) => o.label === val);
                                          const bg = opt ? getHexColor(opt.color) : "#c4c4c4";
                                          return (
                                            <span
                                              key={col.id}
                                              className="text-white text-[10px] font-medium px-2 py-0.5 rounded-full"
                                              style={{ backgroundColor: bg }}
                                            >
                                              {val}
                                            </span>
                                          );
                                        }

                                        // People chip (multi-select avatars)
                                        if (col.type === "people" && Array.isArray(val)) {
                                          const users = profiles.filter((u) => val.includes(u.id));
                                          if (users.length === 0) return null;
                                          return (
                                            <div key={col.id} className="flex -space-x-1.5">
                                              {users.slice(0, 3).map((u) => (
                                                <div
                                                  key={u.id}
                                                  title={u.full_name}
                                                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold ring-1 ring-white"
                                                  style={{ backgroundColor: u.color }}
                                                >
                                                  {u.avatar_initials}
                                                </div>
                                              ))}
                                              {users.length > 3 && (
                                                <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center text-[8px] font-bold text-gray-600 dark:text-gray-300 ring-1 ring-white">
                                                  +{users.length - 3}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        }

                                        // Date chip
                                        if (col.type === "date") {
                                          return (
                                            <span
                                              key={col.id}
                                              className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full"
                                            >
                                              📅{" "}
                                              {new Date(val).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                              })}
                                            </span>
                                          );
                                        }

                                        // Numbers chip
                                        if (col.type === "numbers") {
                                          const num = parseFloat(String(val));
                                          if (isNaN(num)) return null;
                                          return (
                                            <span
                                              key={col.id}
                                              className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full"
                                            >
                                              {num.toLocaleString()}
                                            </span>
                                          );
                                        }

                                        // Text / fallback chip
                                        return (
                                          <span
                                            key={col.id}
                                            className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full truncate max-w-[120px]"
                                          >
                                            {String(val)}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Group name indicator */}
                                  {group && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <div
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: group.color }}
                                      />
                                      <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                                        {group.title}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}

                        {/* Empty lane state */}
                        {laneItems.length === 0 && !snapshot.isDraggingOver && (
                          <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">
                            No items
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
