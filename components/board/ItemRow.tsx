"use client";

import React, { memo } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { GripVertical, MoreHorizontal, Copy, Trash2, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import type { Item, Column, Profile } from "@/types";
import CellRenderer from "@/components/cells/CellRenderer";
import { Tooltip } from "@/components/ui/Tooltip";
import { TruncatedText } from "@/components/ui/TruncatedText";

interface ItemRowProps {
  item: Item;
  index: number;
  columns: Column[];
  profiles: Profile[];
  boardItems: Item[];
  activeStatusId: string | null;
  setActiveStatusId: (id: string | null) => void;
  itemMenuOpen: string | null;
  setItemMenuOpen: (id: string | null) => void;
  onUpdateCell: (itemId: string, columnId: string, value: any) => void;
  onSelectItem: (item: Item) => void;
  onDuplicateItem: (item: Item) => void;
  onRenameItem?: (item: Item, newName: string) => void;
  onDeleteItem: (itemId: string) => void;
  groupColor: string;
  itemNameWidth?: number;
  draggingColumnId?: string | null;
}

/**
 * Single item row — memoized to prevent re-renders when other rows change.
 * Only re-renders when its own item data, columns, or editing state changes.
 */
const ItemRow = memo(function ItemRow({
  item,
  index,
  columns,
  profiles,
  boardItems,
  activeStatusId,
  setActiveStatusId,
  itemMenuOpen,
  setItemMenuOpen,
  onUpdateCell,
  onSelectItem,
  onDuplicateItem,
  onRenameItem,
  onDeleteItem,
  groupColor,
  itemNameWidth = 300,
  draggingColumnId,
}: ItemRowProps) {
  const isMenuOpen = itemMenuOpen === item.id;
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [editNameValue, setEditNameValue] = React.useState(item.name);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [updatesCount, setUpdatesCount] = React.useState(0);

  React.useEffect(() => {
    let isMounted = true;
    async function fetchCount() {
      const { count } = await supabase.from('updates').select('id', { count: 'exact' }).eq('item_id', item.id).is('deleted_at', null);
      if (isMounted && count !== null) {
        setUpdatesCount(count);
      }
    }
    fetchCount();

    const channelName = `updates-count-${item.id}-${Math.random()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'updates', filter: `item_id=eq.${item.id}` }, () => {
        if (isMounted) fetchCount(); // Refetch to be safe, or just +1 since inserts are rarely soft-deleted initially
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'updates', filter: `item_id=eq.${item.id}` }, () => {
        if (isMounted) fetchCount(); // Could be a soft-delete or restore
      })
      .subscribe();

    const handleLocalUpdate = (e: any) => {
      if (e.detail?.itemId === item.id && isMounted) {
        fetchCount();
      }
    };
    window.addEventListener('update-added', handleLocalUpdate);
    window.addEventListener('update-deleted', handleLocalUpdate);
    window.addEventListener('update-restored', handleLocalUpdate);

    return () => { 
      isMounted = false; 
      supabase.removeChannel(channel);
      window.removeEventListener('update-added', handleLocalUpdate);
      window.removeEventListener('update-deleted', handleLocalUpdate);
      window.removeEventListener('update-restored', handleLocalUpdate);
    };
  }, [item.id]);

  React.useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditingName]);

  const commitRename = () => {
    if (editNameValue.trim() && editNameValue !== item.name && onRenameItem) {
      onRenameItem(item, editNameValue.trim());
    } else {
      setEditNameValue(item.name);
    }
    setIsEditingName(false);
  };

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        // Deliberately a plain div, not a motion.div.
        //
        // framer-motion animating `y` writes `transform` on this node, which is
        // the same property @hello-pangea/dnd uses to position a dragged row.
        // They overwrite each other, which made dragging jump around, and the
        // AnimatePresence exit kept a row mounted for 200ms after it left a
        // group, so a cross-group move logged "Unable to find draggable with id"
        // and never saved.
        //
        // The entrance animation is kept as a CSS one, which touches opacity
        // only and so cannot collide with the drag transform.
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`flex border-b border-gray-100 dark:border-slate-800/60 group/row transition-colors animate-in fade-in duration-200 ${
            snapshot.isDragging
              ? "bg-white dark:bg-slate-800 shadow-2xl z-[100] rounded-lg ring-1 ring-indigo-500/20 relative"
              : (isMenuOpen || activeStatusId?.startsWith(item.id))
                ? "bg-white dark:bg-slate-800 shadow-md z-50 relative"
                : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40 hover:z-40 relative z-0"
          }`}
        >
          {/* Color bar + drag handle */}
          <div
            className="w-8 shrink-0 flex items-center justify-center border-r border-gray-200 dark:border-slate-700/50 relative"
            style={{ backgroundColor: groupColor + "15" }}
          >
            <div
              {...provided.dragHandleProps}
              className="opacity-0 group-hover/row:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            >
              <GripVertical size={14} className="text-gray-300 dark:text-gray-600" />
            </div>
          </div>

          {/* Item name */}
          <div
            className="p-2 pl-4 border-r border-gray-200 dark:border-slate-700/50 shrink-0 flex items-center relative group/name cursor-text transition-colors duration-100"
            style={{ width: `${itemNameWidth}px` }}
            onDoubleClick={() => {
              setEditNameValue(item.name);
              setIsEditingName(true);
            }}
          >
            {isEditingName ? (
              <input
                ref={inputRef}
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setEditNameValue(item.name);
                    setIsEditingName(false);
                  }
                }}
                className="w-full bg-white dark:bg-slate-900 border border-blue-500 rounded px-2 py-1 text-sm text-gray-900 dark:text-white outline-none"
              />
            ) : (
              <TruncatedText
                className="text-sm text-gray-800 dark:text-gray-100 truncate flex-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {item.name}
              </TruncatedText>
            )}

            {/* Updates indicator */}
            {!isEditingName && (
              <Tooltip
                content={
                  updatesCount > 0
                    ? `${updatesCount} update${updatesCount > 1 ? "s" : ""}`
                    : "Add update"
                }
                side="top"
              >
                <div 
                  className={`flex items-center justify-center mr-2 relative shrink-0 cursor-pointer ${updatesCount > 0 ? 'text-blue-500' : 'text-gray-300 dark:text-gray-500 hover:text-blue-500 opacity-0 group-hover/name:opacity-100'} transition-all`} 
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectItem(item);
                  }}
                >
                  <MessageCircle size={18} className={updatesCount > 0 ? "fill-blue-500 text-blue-500" : "fill-transparent text-current"} />
                  {updatesCount > 0 ? (
                    <span className="absolute text-[9px] font-bold text-white mb-[1px]">{updatesCount > 9 ? '9+' : updatesCount}</span>
                  ) : (
                    <span className="absolute text-[12px] font-medium text-current mb-[1px]">+</span>
                  )}
                </div>
              </Tooltip>
            )}

            {/* Row context menu button */}
            {!isEditingName && (
              <div className="opacity-0 group-hover/name:opacity-100 transition-opacity">
                <Tooltip content="Item menu" side="top">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setItemMenuOpen(isMenuOpen ? null : item.id);
                    }}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    <MoreHorizontal size={14} className="text-gray-400" />
                  </button>
                </Tooltip>
              </div>
            )}

            {/* Context menu dropdown */}
            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute top-full right-0 mt-1 w-44 dropdown-menu py-1 z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onDuplicateItem(item)}
                    className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Copy size={14} className="mr-2.5 text-gray-400" />
                    Duplicate
                  </button>
                  <div className="border-t border-gray-100 dark:border-slate-800 my-0.5"></div>
                  <button
                    onClick={() => {
                      setItemMenuOpen(null);
                      onDeleteItem(item.id);
                    }}
                    className="flex items-center w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 size={14} className="mr-2.5" />
                    Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Dynamic cells */}
          {columns.map((col) => {
            const isDraggingCol = col.id === draggingColumnId;
            return (
              <div
                key={col.id}
                data-cell-group={item.group_id}
                data-cell-col={col.id}
                className={`shrink-0 flex self-stretch ${isDraggingCol ? 'bg-white dark:bg-slate-800 rounded shadow-md' : ''}`}
              >
                <CellRenderer
                  item={item}
                  column={col}
                  activeStatusId={activeStatusId}
                  setActiveStatusId={setActiveStatusId}
                  onUpdate={onUpdateCell}
                  profiles={profiles}
                  boardItems={boardItems}
                  columns={columns}
                />
              </div>
            );
          })}

          {/* Spacer for the + button column */}
          <div className="w-16 shrink-0"></div>
        </div>
      )}
    </Draggable>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for performance — only re-render when relevant data changes
  return (
    prevProps.item === nextProps.item &&
    prevProps.index === nextProps.index &&
    prevProps.columns === nextProps.columns &&
    prevProps.activeStatusId === nextProps.activeStatusId &&
    prevProps.itemMenuOpen === nextProps.itemMenuOpen &&
    prevProps.profiles === nextProps.profiles &&
    prevProps.groupColor === nextProps.groupColor &&
    prevProps.itemNameWidth === nextProps.itemNameWidth &&
    prevProps.draggingColumnId === nextProps.draggingColumnId
  );
});

export default ItemRow;
