"use client";

import React, { useState, useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useT } from "@/components/LanguageProvider";
import { displayColumnTitle, displayStatus, displayCellLabel } from "@/lib/i18n/labels";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { ChevronDown, Columns3, Link2 } from "lucide-react";

import { Item, Column, Group, STATUS_OPTIONS, Profile } from "@/types";
import { statusHexOr } from "@/lib/statusColor";
import { useLanguage } from "@/components/LanguageProvider";
import { parseDateOnly } from "@/lib/gantt/dates";
import { useBoardStore } from "@/hooks/useBoardStore";
import { TruncatedText } from "@/components/ui/TruncatedText";

// ============================================================
// Helpers
// ============================================================

/** Extract raw hex from Tailwind bg class like "bg-[#fdab3d]" */
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
  // bcp47 as well as t: a card showing "Sep 25" in a French app is exactly
  // the half-translated feeling this pass exists to remove.
  const { t, bcp47 } = useLanguage();

  /**
   * A yyyy-MM-dd value as a short date in the reader's language.
   *
   * Through parseDateOnly rather than new Date(): the latter reads a bare
   * date as UTC midnight and renders the day before anywhere west of
   * Greenwich. Harmless in Morocco, wrong in London.
   */
  const shortDate = (value: unknown) => {
    const date = parseDateOnly(value);
    return date
      ? date.toLocaleDateString(bcp47, { month: "short", day: "numeric" })
      : "";
  };
  const statusColumns = columns.filter((c) => c.type === "status" || c.type === "priority");
  const [kanbanColumnId, setKanbanColumnId] = useState<string>("");
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const { state } = useBoardStore();

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
        <h2 className="text-xl font-medium text-gray-700 dark:text-gray-200 mb-2">
          {t("kanban.noStatusTitle")}
        </h2>
        <p className="text-gray-400 dark:text-gray-500 text-sm">{t("kanban.noStatusBody")}</p>
      </div>
    );
  }

  const selectedColumn = statusColumns.find((c) => c.id === kanbanColumnId);

  const PRIORITY_OPTIONS = [
    { label: "Critical", color: "bg-[#333333] text-white" },
    { label: "High", color: "bg-[#e2445c] text-white" },
    { label: "Medium", color: "bg-[#a25ddc] text-white" },
    { label: "Low", color: "bg-[#579bfc] text-white" },
    { label: "Empty", color: "bg-[#c4c4c4] dark:bg-[#3e4157] text-white" },
  ];

  const laneOptions = selectedColumn?.type === "priority" 
    ? PRIORITY_OPTIONS 
    : selectedColumn?.settings?.statusLabels || STATUS_OPTIONS;

  // Other columns to display as chips on cards (exclude the kanban grouping column, max 3)
  const chipColumns = columns.filter((c) => c.id !== kanbanColumnId).slice(0, 3);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#f5f6f8] dark:bg-slate-950">
      {/* ===== Column Picker ===== */}
      <div className="px-8 py-4 flex items-center gap-3 shrink-0" ref={pickerRef}>
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{t("kanban.groupBy")}</span>
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:border-slate-500 transition-colors shadow-sm dark:shadow-none"
          >
            {selectedColumn?.title || t("kanban.selectColumn")}
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
                  className={`flex items-center w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                    kanbanColumnId === col.id
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {displayColumnTitle(t, col.title)}
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
            {laneOptions.map((status) => {
              const hexColor = statusHexOr(status.color);

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
                    <span className="text-white text-sm font-semibold">
                      {displayCellLabel(t, selectedColumn?.type ?? "status", status.label)}
                    </span>
                    <span className="bg-white dark:bg-slate-900/25 text-gray-800 dark:text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center">
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
                            ? "bg-indigo-50/50 dark:bg-indigo-900/10 ring-1 ring-indigo-500/20"
                            : "bg-gray-100/50 dark:bg-slate-900/40"
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
                                  className={`kanban-card bg-white dark:bg-slate-800 rounded-lg p-3.5 cursor-grab active:cursor-grabbing transition-shadow border border-gray-100 dark:border-slate-700/50 ${
                                    snapshot.isDragging
                                      ? "shadow-2xl ring-1 ring-indigo-500/50 z-50 scale-[1.02]"
                                      : "shadow-sm hover:shadow-md"
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
                                    <TruncatedText className="truncate block">{item.name}</TruncatedText>
                                  </div>

                                  {/* Column value chips */}
                                  {chipColumns.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                                      {chipColumns.map((col) => {
                                        const val = item.column_values?.[col.id];
                                        if (val === undefined || val === null || val === "") return null;

                                        // Status chip
                                        if (col.type === "status") {
                                          // The column's own labels first: a board
                                          // that renamed its statuses is not in
                                          // the built-in list.
                                          const opts = col.settings?.statusLabels || STATUS_OPTIONS;
                                          const opt = opts.find((o) => o.label === val);
                                          const bg = statusHexOr(opt?.color);
                                          return (
                                            <span
                                              key={col.id}
                                              className="text-white text-[10px] font-medium px-2 py-0.5 rounded-full"
                                              style={{ backgroundColor: bg }}
                                            >
                                              {displayStatus(t, val as string)}
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
                                                <Avatar
                                                  key={u.id}
                                                  name={u.full_name}
                                                  initials={u.avatar_initials}
                                                  url={u.avatar_url}
                                                  color={u.color}
                                                  size={20}
                                                  className="ring-1 ring-white"
                                                />
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
                                              {shortDate(val)}
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

                                        // Timeline chip
                                        if (col.type === "timeline" && typeof val === "object") {
                                          const start = shortDate(val?.start);
                                          const end = shortDate(val?.end);
                                          const text = start && end ? `${start} - ${end}` : start || end;
                                          if (!text) return null;
                                          return (
                                            <span
                                              key={col.id}
                                              className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full"
                                            >
                                              {text}
                                            </span>
                                          );
                                        }

                                        // Dependency chip
                                        if (col.type === "dependency" && Array.isArray(val)) {
                                          if (val.length === 0) return null;
                                          return (
                                            <span
                                              key={col.id}
                                              className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full"
                                            >
                                              🔗{" "}
                                              {val.length === 1
                                                ? t("kanban.depCountOne", { count: val.length })
                                                : t("kanban.depCount", { count: val.length })}
                                            </span>
                                          );
                                        }

                                        // Text / fallback chip
                                        return (
                                          <span
                                            key={col.id}
                                            className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full truncate max-w-[120px]"
                                          >
                                            <TruncatedText className="truncate block">{String(val)}</TruncatedText>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Group name & Relations indicator */}
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 dark:border-slate-700/50">
                                    {group && (
                                      <div className="flex items-center gap-1.5">
                                        <div
                                          className="w-2 h-2 rounded-full shrink-0"
                                          style={{ backgroundColor: group.color }}
                                        />
                                        <TruncatedText className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                                          {group.title}
                                        </TruncatedText>
                                      </div>
                                    )}
                                    
                                    {(() => {
                                      const myLinks = state.itemLinks.filter(l => l.source_item_id === item.id || l.target_item_id === item.id);
                                      if (myLinks.length === 0) return null;
                                      return (
                                        <div className="flex items-center gap-1 text-[10px] font-medium text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                          <Link2 size={10} />
                                          {myLinks.length}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}

                        {/* Empty lane state */}
                        {laneItems.length === 0 && !snapshot.isDraggingOver && (
                          <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">
                            {t("kanban.noItems")}
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
