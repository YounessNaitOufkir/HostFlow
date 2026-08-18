"use client";

import React, { memo, useMemo, useState, useRef, useEffect } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Trash2,
  Plus,
  Pencil,
  Settings2,
  AlignLeft,
  Calendar,
  Hash,
  Users,
  Clock,
  Tag,
  Paperclip,
  AlertTriangle,
  Link2,
  CheckSquare,
  Star,
  Calculator,
  GripVertical,
  ArrowUp,
  ArrowDown,
  X,
  Palette,
} from "lucide-react";
import type { Item, Column, ColumnType, Profile, Group } from "@/types";
import ColumnHeader from "@/components/ColumnHeader";
import GroupFooter from "@/components/GroupFooter";
import ItemRow from "@/components/board/ItemRow";
import { getColumnsByCategory, type ColumnDefinition } from "@/lib/columnRegistry";

export interface GroupSectionProps {
  group: Group;
  items: Item[];
  allItems: Item[];
  columns: Column[];
  profiles: Profile[];
  editingGroupId: string | null;
  editGroupTitle: string;
  addingToGroupId: string | null;
  newItemName: string;
  activeStatusId: string | null;
  showAddColumnMenu: string | null;
  itemMenuOpen: string | null;
  onSetEditingGroup: (id: string | null, title: string) => void;
  onRenameGroup: (groupId: string, title: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSetAddingToGroup: (id: string | null) => void;
  onSetNewItemName: (name: string) => void;
  onAddItem: (groupId: string, name: string) => void;
  onUpdateCell: (itemId: string, columnId: string, value: any) => void;
  onSelectItem: (item: Item) => void;
  onDuplicateItem: (item: Item) => void;
  onRenameItem: (item: Item, newName: string) => void;
  onDeleteItem: (itemId: string) => void;
  onSetActiveStatusId: (id: string | null) => void;
  onSetShowAddColumnMenu: (id: string | null) => void;
  onSetItemMenuOpen: (id: string | null) => void;
  onChangeGroupColor: (groupId: string, color: string) => void;
  itemNameColumn?: string;
  onRenameItemNameColumn?: (newName: string) => void;
  itemNameWidth?: number;
  onResizeItemNameColumn?: (width: number) => void;
  onAddColumn: (type: ColumnType) => void;
  onRenameColumn: (columnId: string, title: string) => void;
  onResizeColumn: (columnId: string, width: number) => void;
  onDeleteColumn: (columnId: string) => void;
  draggingId?: string | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  dragHandleProps?: any;
  onMoveGroup?: (groupId: string, direction: "up" | "down") => void;
  isFirstGroup?: boolean;
  isLastGroup?: boolean;
}

const COLUMN_ICON_MAP: Record<string, React.ElementType> = {
  status: Settings2,
  text: AlignLeft,
  date: Calendar,
  number: Hash,
  person: Users,
  timeline: Clock,
  tags: Tag,
  file: Paperclip,
  priority: AlertTriangle,
  link: Link2,
  checkbox: CheckSquare,
  rating: Star,
  formula: Calculator,
};

const PRESET_COLORS = ["#579bfc", "#00c875", "#e2445c", "#fdab3d", "#a25ddc", "#333333"];

const EXTENDED_COLORS = [
  "#579bfc", "#00c875", "#e2445c", "#fdab3d", "#a25ddc", "#333333",
  "#0086c0", "#175a63", "#ff642e", "#ff7575", "#ffadad", "#ffcb00",
  "#784bd1", "#4eccc6", "#66ccff", "#9cd326", "#cab641", "#ff158a"
];

/**
 * Renders a single group section: header, column headers, item rows, footer, and add-item row.
 * Memoized to prevent re-render when other groups change.
 */
const GroupSection = memo(function GroupSection({
  group,
  items,
  allItems,
  columns,
  profiles,
  editingGroupId,
  editGroupTitle,
  addingToGroupId,
  newItemName,
  activeStatusId,
  showAddColumnMenu,
  itemMenuOpen,
  onSetEditingGroup,
  onRenameGroup,
  onDeleteGroup,
  onSetAddingToGroup,
  onSetNewItemName,
  onAddItem,
  onUpdateCell,
  onSelectItem,
  onDuplicateItem,
  onRenameItem,
  onDeleteItem,
  onSetActiveStatusId,
  onSetShowAddColumnMenu,
  onSetItemMenuOpen,
  onChangeGroupColor,
  itemNameColumn = "Item Name",
  onRenameItemNameColumn,
  itemNameWidth = 300,
  onResizeItemNameColumn,
  onAddColumn,
  onRenameColumn,
  onResizeColumn,
  onDeleteColumn,
  draggingId,
  isCollapsed = false,
  onToggleCollapse,
  dragHandleProps,
  onMoveGroup,
  isFirstGroup = false,
  isLastGroup = false,
}: GroupSectionProps) {
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isCustomColorModalOpen, setIsCustomColorModalOpen] = useState(false);
  const [customColorValue, setCustomColorValue] = useState(group.color);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isColorPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setIsColorPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isColorPickerOpen]);

  const [isEditingItemName, setIsEditingItemName] = useState(false);
  const [editingItemNameValue, setEditingItemNameValue] = useState(itemNameColumn);
  const itemNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingItemName && itemNameInputRef.current) {
      itemNameInputRef.current.focus();
    }
  }, [isEditingItemName]);

  const commitItemNameColumn = () => {
    if (editingItemNameValue.trim() && editingItemNameValue !== itemNameColumn && onRenameItemNameColumn) {
      onRenameItemNameColumn(editingItemNameValue.trim());
    } else {
      setEditingItemNameValue(itemNameColumn);
    }
    setIsEditingItemName(false);
  };

  const [dragItemNameWidth, setDragItemNameWidth] = useState<number | null>(null);

  const handleResizeItemNameStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = itemNameWidth;
    setDragItemNameWidth(startWidth);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diffX = moveEvent.pageX - startX;
      let newWidth = startWidth + diffX;
      if (newWidth < 150) newWidth = 150; // min width for item name
      if (newWidth > 800) newWidth = 800; // max width
      setDragItemNameWidth(newWidth);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      
      const diffX = upEvent.pageX - startX;
      let newWidth = startWidth + diffX;
      if (newWidth < 150) newWidth = 150;
      if (newWidth > 800) newWidth = 800;
      
      if (diffX !== 0 && onResizeItemNameColumn) {
        onResizeItemNameColumn(newWidth);
      }
      setDragItemNameWidth(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const activeItemNameWidth = dragItemNameWidth !== null ? dragItemNameWidth : itemNameWidth;

  const groupItems = useMemo(
    () => items.filter((i) => i.group_id === group.id),
    [items, group.id]
  );

  const essentialCols = getColumnsByCategory("essential");
  const advancedCols = getColumnsByCategory("advanced");
  const computedCols = getColumnsByCategory("computed");

  const activeDragColId = draggingId?.startsWith(`col-${group.id}-`)
    ? draggingId.replace(`col-${group.id}-`, "")
    : null;

  useEffect(() => {
    if (!draggingId) {
      // Cleanup all transforms when drag ends globally
      const allCells = document.querySelectorAll(`[data-cell-group="${group.id}"]`);
      allCells.forEach(cell => {
        const el = cell as HTMLElement;
        el.style.transform = '';
        el.style.transition = '';
        el.style.zIndex = '';
        el.style.position = '';
        el.style.boxShadow = '';
        el.style.opacity = '';
        el.style.background = '';
      });
      return;
    }

    // Only run loop if a column in THIS group is being dragged
    if (!activeDragColId) return;

    let rafId: number;
    const syncTransforms = () => {
      const headers = document.querySelectorAll(`[data-header-group="${group.id}"]`);
      
      headers.forEach(header => {
        const colId = header.getAttribute('data-col-id');
        const cells = document.querySelectorAll(`[data-cell-group="${group.id}"][data-cell-col="${colId}"]`);
        if (!cells.length) return;

        const isDragging = colId === activeDragColId;
        const hEl = header as HTMLElement;

        // Read the transform that @hello-pangea/dnd applies to this header wrapper
        const transform = hEl.style.transform;
        const transition = hEl.style.transition;

        cells.forEach(cell => {
          const cEl = cell as HTMLElement;
          cEl.style.transform = transform;
          cEl.style.transition = transition;

          if (isDragging) {
            cEl.style.zIndex = '9999';
            cEl.style.position = 'relative';
            cEl.style.boxShadow = '0 8px 25px -5px rgb(0 0 0 / 0.3)';
            cEl.style.opacity = '0.92';
          } else {
            cEl.style.zIndex = '';
            cEl.style.position = '';
            cEl.style.boxShadow = '';
            cEl.style.opacity = '';
          }
        });
      });
      rafId = requestAnimationFrame(syncTransforms);
    };
    
    rafId = requestAnimationFrame(syncTransforms);
    return () => cancelAnimationFrame(rafId);
  }, [activeDragColId, draggingId, group.id]);

  return (
    <div className="mb-8">
      {/* Group Title */}
      <div className="flex items-center mb-1.5 group/grouptitle">
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mr-1 p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
            title="Drag to reorder group"
          >
            <GripVertical size={16} />
          </div>
        )}
        <button onClick={onToggleCollapse} className="mr-1.5 focus:outline-none flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors w-6 h-6">
          <ChevronDown 
            size={16} 
            style={{ 
              color: group.color,
              transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease-in-out"
            }} 
          />
        </button>
        {editingGroupId === group.id ? (
          <input
            autoFocus
            type="text"
            value={editGroupTitle}
            onChange={(e) => onSetEditingGroup(group.id, e.target.value)}
            onBlur={() => onRenameGroup(group.id, editGroupTitle)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameGroup(group.id, editGroupTitle);
              if (e.key === "Escape") onSetEditingGroup(null, "");
            }}
            className="text-lg font-bold bg-transparent border-b border-blue-500 focus:outline-none text-gray-900 dark:text-white px-1"
          />
        ) : (
          <h2
            className="text-lg font-bold text-gray-900 dark:text-white cursor-text hover:bg-gray-100 dark:hover:bg-slate-800 px-1 rounded transition-colors"
            style={{ color: group.color }}
            onClick={() => onSetEditingGroup(group.id, group.title)}
          >
            {group.title}
          </h2>
        )}
        
        {/* Color Picker and Move Arrows (moved to right side of group name) */}
        <div className="flex items-center ml-2 mr-2 opacity-0 group-hover/grouptitle:opacity-100 transition-opacity">
          <div className="relative" ref={colorPickerRef}>
            <button
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
              title="Change Color"
            >
              <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-slate-600" style={{ backgroundColor: group.color }}></div>
            </button>
            {isColorPickerOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-xl rounded-lg p-2 z-50 w-48">
                <div className="grid grid-cols-6 gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => {
                        onChangeGroupColor(group.id, c);
                        setIsColorPickerOpen(false);
                      }}
                      className="w-6 h-6 rounded-full border border-gray-200 dark:border-slate-700 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="border-t border-gray-100 dark:border-slate-700 pt-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomColorValue(group.color);
                      setIsColorPickerOpen(false);
                      setIsCustomColorModalOpen(true);
                    }}
                    className="w-full flex items-center text-sm text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 p-1.5 rounded transition-colors font-medium"
                  >
                    <div className="w-4 h-4 rounded-full border border-gray-200 dark:border-slate-700 mr-2" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }} />
                    Custom color...
                  </button>
                </div>
              </div>
            )}
          </div>
          {onMoveGroup && (
            <div className="flex items-center space-x-0.5 ml-1 border-r border-gray-200 dark:border-slate-700 pr-1 mr-1">
              <button
                className={`p-1 rounded transition-all ${
                  isFirstGroup
                    ? "opacity-30 cursor-not-allowed text-gray-300 dark:text-gray-600"
                    : "hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                }`}
                onClick={() => !isFirstGroup && onMoveGroup(group.id, "up")}
                disabled={isFirstGroup}
                title="Move Group Up"
              >
                <ArrowUp size={15} />
              </button>
              <button
                className={`p-1 rounded transition-all ${
                  isLastGroup
                    ? "opacity-30 cursor-not-allowed text-gray-300 dark:text-gray-600"
                    : "hover:bg-gray-200 dark:hover:bg-slate-800 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                }`}
                onClick={() => !isLastGroup && onMoveGroup(group.id, "down")}
                disabled={isLastGroup}
                title="Move Group Down"
              >
                <ArrowDown size={15} />
              </button>
            </div>
          )}
        </div>
        <span className="text-gray-400 dark:text-gray-500 text-sm ml-4 font-normal tracking-wide">
          {groupItems.length} {groupItems.length === 1 ? "item" : "items"}
        </span>
        <div className="flex items-center ml-auto opacity-0 group-hover/grouptitle:opacity-100 transition-opacity">
          <button
            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-all ml-1"
            onClick={() => onDeleteGroup(group.id)}
            title="Delete Group"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Table Card */}
      {!isCollapsed && (
        <div className="bg-white dark:bg-[#181b34] rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors">
        {/* Column Headers */}
        <div className="flex rounded-t-xl border-b border-gray-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          <div
            className="w-8 shrink-0 flex items-center justify-center border-r border-gray-200 dark:border-slate-800 rounded-tl-xl"
            style={{ backgroundColor: group.color }}
          ></div>
          <div 
            className={`p-3 pl-4 border-r border-gray-200 dark:border-slate-800 shrink-0 flex items-center group/itemname justify-between cursor-pointer transition-colors duration-100 relative ${dragItemNameWidth !== null ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
            style={{ width: `${activeItemNameWidth}px` }}
            onDoubleClick={() => {
              if (onRenameItemNameColumn) {
                setEditingItemNameValue(itemNameColumn);
                setIsEditingItemName(true);
              }
            }}
          >
            {isEditingItemName ? (
              <input
                ref={itemNameInputRef}
                type="text"
                value={editingItemNameValue}
                onChange={(e) => setEditingItemNameValue(e.target.value)}
                onBlur={commitItemNameColumn}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitItemNameColumn();
                  if (e.key === "Escape") {
                    setEditingItemNameValue(itemNameColumn);
                    setIsEditingItemName(false);
                  }
                }}
                className="w-full bg-white dark:bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs text-gray-900 dark:text-white outline-none font-normal"
              />
            ) : (
              <span>{itemNameColumn}</span>
            )}
            
            {!isEditingItemName && onRenameItemNameColumn && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingItemNameValue(itemNameColumn);
                  setIsEditingItemName(true);
                }}
                className="opacity-0 group-hover/itemname:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-all text-gray-500"
                title="Rename Column"
              >
                <Pencil size={12} />
              </button>
            )}

            {/* Resize Handle */}
            <div 
              className={`absolute right-[-3px] top-0 bottom-0 w-[6px] cursor-col-resize z-10 flex items-center justify-center group/resizer`}
              onMouseDown={handleResizeItemNameStart}
            >
              <div className={`w-[2px] h-full transition-all duration-150 ${dragItemNameWidth !== null ? 'bg-blue-500 opacity-100' : 'bg-gray-300 dark:bg-slate-600 opacity-0 group-hover/itemname:opacity-100 group-hover/resizer:bg-blue-400 group-hover/resizer:w-[3px]'}`} />
            </div>
          </div>

          {/* Draggable column headers */}
          <Droppable droppableId={`columns-${group.id}`} direction="horizontal" type="COLUMN">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex min-w-max"
              >
                {columns.map((col, colIndex) => (
                  <Draggable key={`col-${group.id}-${col.id}`} draggableId={`col-${group.id}-${col.id}`} index={colIndex}>
                    {(colProvided) => (
                      <div
                        ref={colProvided.innerRef}
                        {...colProvided.draggableProps}
                        data-header-group={group.id}
                        data-col-id={col.id}
                      >
                        <ColumnHeader
                          column={col}
                          dragHandleProps={colProvided.dragHandleProps}
                          onRename={onRenameColumn}
                          onResize={onResizeColumn}
                          onDelete={onDeleteColumn}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          {/* Add Column Button */}
          <div
            className="relative w-16 shrink-0 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/[0.04] cursor-pointer transition-colors rounded-tr-xl"
            onClick={(e) => {
              e.stopPropagation();
              onSetShowAddColumnMenu(showAddColumnMenu === group.id ? null : group.id);
            }}
          >
            <Plus size={16} className="text-gray-400 hover:text-blue-500 transition-colors" />

            <AnimatePresence>
              {showAddColumnMenu === group.id && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute top-full right-0 mt-1 w-56 dropdown-menu py-2 z-50 max-h-80 overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Essential columns */}
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Essential
                  </div>
                  {essentialCols.map((def) => {
                    const Icon = COLUMN_ICON_MAP[def.type] || Hash;
                    return (
                      <button
                        key={def.type}
                        onClick={() => onAddColumn(def.type)}
                        className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                      >
                        <Icon size={14} className="mr-2.5 text-gray-400" />
                        {def.label}
                      </button>
                    );
                  })}

                  <div className="border-t border-gray-100 dark:border-slate-700 my-1"></div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Advanced
                  </div>
                  {advancedCols.map((def) => {
                    const Icon = COLUMN_ICON_MAP[def.type] || Hash;
                    return (
                      <button
                        key={def.type}
                        onClick={() => onAddColumn(def.type)}
                        className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                      >
                        <Icon size={14} className="mr-2.5 text-gray-400" />
                        {def.label}
                      </button>
                    );
                  })}

                  <div className="border-t border-gray-100 dark:border-slate-700 my-1"></div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Computed
                  </div>
                  {computedCols.map((def) => {
                    const Icon = COLUMN_ICON_MAP[def.type] || Hash;
                    return (
                      <button
                        key={def.type}
                        onClick={() => onAddColumn(def.type)}
                        className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                      >
                        <Icon size={14} className="mr-2.5 text-gray-400" />
                        {def.label}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Item Rows */}
        <Droppable droppableId={group.id}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[2px]">
              {/* No AnimatePresence here on purpose: its exit animation keeps a
                  row mounted after it has left the group, and @hello-pangea/dnd
                  then cannot resolve the draggable during a cross-group move.
                  Rows fade in via CSS instead. */}
              {groupItems.map((item, idx) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={idx}
                    columns={columns}
                    profiles={profiles}
                    boardItems={allItems}
                    activeStatusId={activeStatusId}
                    setActiveStatusId={onSetActiveStatusId}
                    itemMenuOpen={itemMenuOpen}
                    setItemMenuOpen={onSetItemMenuOpen}
                    onUpdateCell={onUpdateCell}
                    onSelectItem={onSelectItem}
                    onDuplicateItem={onDuplicateItem}
                    onRenameItem={onRenameItem}
                    onDeleteItem={onDeleteItem}
                    groupColor={group.color}
                    itemNameWidth={activeItemNameWidth}
                    draggingColumnId={activeDragColId}
                  />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        {/* Add Item Row */}
        {addingToGroupId === group.id ? (
          <div className="flex border-b border-gray-100 dark:border-slate-700/50">
            <div
              className="w-8 shrink-0 border-r border-gray-200 dark:border-slate-700/50"
              style={{ backgroundColor: group.color + "15" }}
            ></div>
            <div 
              className="p-2 pl-4 shrink-0 border-r border-gray-200 dark:border-slate-700/50"
              style={{ width: `${activeItemNameWidth}px` }}
            >
              <input
                autoFocus
                placeholder="Item name..."
                value={newItemName}
                onChange={(e) => onSetNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onAddItem(group.id, newItemName);
                  if (e.key === "Escape") onSetAddingToGroup(null);
                }}
                onBlur={() => {
                  if (newItemName.trim()) onAddItem(group.id, newItemName);
                  else onSetAddingToGroup(null);
                }}
                className="w-full text-sm outline-none bg-transparent text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
              />
            </div>
          </div>
        ) : (
          <div className="flex border-b border-gray-100 dark:border-slate-700/50">
            <div
              className="w-8 shrink-0 border-r border-gray-200 dark:border-slate-700/50"
            ></div>
            <div
              className="flex items-center px-4 py-2 cursor-pointer text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 dark:hover:bg-white/[0.02] transition-colors text-sm"
              style={{ width: `${activeItemNameWidth}px` }}
              onClick={() => onSetAddingToGroup(group.id)}
            >
              <Plus size={14} className="mr-1.5" /> Add Item
            </div>
          </div>
        )}

        {/* Group Footer (summaries) */}
        <GroupFooter columns={columns} items={groupItems} groupColor={group.color} />
      </div>
      )}

      {/* Centered Custom Color Picker Modal */}
      {isCustomColorModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div 
            className="w-full max-w-md bg-white dark:bg-[#1a1e36] rounded-2xl border border-gray-200 dark:border-slate-700/80 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Palette size={18} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Choose Group Color
                </h3>
              </div>
              <button
                onClick={() => setIsCustomColorModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Live Preview */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Live Preview
                </label>
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#131526] border border-gray-200/70 dark:border-slate-800 flex items-center space-x-3">
                  <div className="w-5 h-5 rounded-full shadow-sm border border-black/10" style={{ backgroundColor: customColorValue }} />
                  <span className="text-lg font-bold" style={{ color: customColorValue }}>
                    {group.title}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto bg-gray-200/70 dark:bg-slate-800 text-gray-600 dark:text-gray-300">
                    {groupItems.length} {groupItems.length === 1 ? "item" : "items"}
                  </span>
                </div>
              </div>

              {/* Native OS Color Spectrum Picker & Hex Input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Visual Picker
                  </label>
                  <label className="relative block w-full h-11 rounded-xl cursor-pointer border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm hover:border-blue-500 transition-colors">
                    <input
                      type="color"
                      value={customColorValue}
                      onChange={(e) => setCustomColorValue(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-full h-full flex items-center justify-between px-3.5 bg-gray-50 dark:bg-[#141629]">
                      <div className="flex items-center space-x-2.5">
                        <div 
                          className="w-6 h-6 rounded-lg shadow-sm border border-black/10"
                          style={{ backgroundColor: customColorValue }} 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          Pick color
                        </span>
                      </div>
                      <div className="w-4 h-4 rounded-full" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }} />
                    </div>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Hex Code
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={customColorValue}
                      onChange={(e) => setCustomColorValue(e.target.value)}
                      placeholder="#579bfc"
                      maxLength={7}
                      className="w-full h-11 px-3.5 bg-gray-50 dark:bg-[#141629] border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Extended Modern Palette */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5">
                  Curated Colors
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {EXTENDED_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCustomColorValue(color)}
                      className={`h-9 rounded-xl transition-all flex items-center justify-center border ${
                        customColorValue.toLowerCase() === color.toLowerCase()
                          ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-[#1a1e36] scale-105 border-white dark:border-slate-800 shadow-md"
                          : "border-gray-200/60 dark:border-slate-700/60 hover:scale-105 hover:shadow"
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-gray-50 dark:bg-[#141629] border-t border-gray-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsCustomColorModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeGroupColor(group.id, customColorValue);
                  setIsCustomColorModalOpen(false);
                }}
                className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors shadow-sm"
              >
                Apply Color
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default GroupSection;
