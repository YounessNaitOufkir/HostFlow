"use client";

import React, { useCallback, useMemo } from "react";
import { DragDropContext, DropResult, DragStart } from "@hello-pangea/dnd";
import { Plus, Layout as LayoutIcon } from "lucide-react";
import type { Item, Column, ColumnType, Group, Profile, Automation } from "@/types";
import GroupSection from "@/components/board/GroupSection";

interface BoardTableViewProps {
  boardId: string;
  groups: Group[];
  filteredItems: Item[];
  allItems: Item[];
  columns: Column[];
  profiles: Profile[];
  boardAutomations: Automation[];

  // Editing state
  editingGroupId: string | null;
  editGroupTitle: string;
  addingToGroupId: string | null;
  newItemName: string;
  activeStatusId: string | null;
  showAddColumnMenu: string | null;
  itemMenuOpen: string | null;

  // Actions
  onSetEditingGroup: (id: string | null, title: string) => void;
  onRenameGroup: (groupId: string, title: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSetAddingToGroup: (id: string | null) => void;
  onSetNewItemName: (name: string) => void;
  onAddItem: (groupId: string, name: string) => void;
  onUpdateCell: (itemId: string, columnId: string, value: any) => void;
  onSelectItem: (item: Item) => void;
  onDuplicateItem: (item: Item) => void;
  onDeleteItem: (itemId: string) => void;
  onSetActiveStatusId: (id: string | null) => void;
  onSetShowAddColumnMenu: (id: string | null) => void;
  onSetItemMenuOpen: (id: string | null) => void;
  onAddColumn: (type: ColumnType) => void;
  onRenameColumn: (columnId: string, title: string) => void;
  onResizeColumn: (columnId: string, width: number) => void;
  onDeleteColumn: (columnId: string) => void;
  onChangeGroupColor: (groupId: string, color: string) => void;
  onAddGroup: () => void;
  onDragEnd: (result: DropResult) => void;
  
  itemNameColumn: string;
  onRenameItemNameColumn: (newName: string) => void;
  onRenameItem: (item: Item, newName: string) => void;
  collapsedGroups?: string[];
  onToggleGroupCollapse?: (groupId: string) => void;
}

/**
 * BoardTableView — The main table grid view.
 * Renders all groups with their items in a DragDropContext.
 */
export default function BoardTableView({
  boardId,
  groups,
  filteredItems,
  allItems,
  columns,
  profiles,
  boardAutomations,
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
  onDeleteItem,
  onSetActiveStatusId,
  onSetShowAddColumnMenu,
  onSetItemMenuOpen,
  onAddColumn,
  onRenameColumn,
  onResizeColumn,
  onDeleteColumn,
  onChangeGroupColor,
  onAddGroup,
  onDragEnd,
  itemNameColumn,
  onRenameItemNameColumn,
  onRenameItem,
  collapsedGroups = [],
  onToggleGroupCollapse,
}: BoardTableViewProps) {
  const [itemNameWidth, setItemNameWidth] = React.useState(300);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);

  const handleDragStart = useCallback((start: DragStart) => {
    setDraggingId(start.draggableId);
  }, []);

  const handleDragEnd = useCallback((result: DropResult) => {
    setDraggingId(null);
    onDragEnd(result);
  }, [onDragEnd]);

  // Load width from local storage
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`hostflow_board_${boardId}_itemNameWidth`);
        if (stored) {
          setItemNameWidth(parseInt(stored, 10));
        }
      } catch (e) {}
    }
  }, [boardId]);

  const handleResizeItemNameColumn = useCallback((newWidth: number) => {
    setItemNameWidth(newWidth);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`hostflow_board_${boardId}_itemNameWidth`, newWidth.toString());
      } catch (e) {}
    }
  }, [boardId]);

  // Sort groups by position
  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.position - b.position), [groups]);

  const handleAreaClick = useCallback(() => {
    onSetActiveStatusId(null);
    onSetShowAddColumnMenu(null);
  }, [onSetActiveStatusId, onSetShowAddColumnMenu]);

  return (
    <div
      className="flex-1 overflow-auto p-8 bg-[#f6f7fb] dark:bg-[#181b34]"
      onClick={handleAreaClick}
    >
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="min-w-max">
          <div className="space-y-12">
            {groups.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center mb-4 shadow-lg">
                  <LayoutIcon size={28} className="text-blue-500 dark:text-blue-400" />
                </div>
                <p className="text-lg font-medium mb-1 text-gray-600 dark:text-gray-300">
                  No groups yet
                </p>
                <p className="text-sm mb-4">
                  Get started by adding your first group
                </p>
                <button
                  onClick={onAddGroup}
                  className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
                >
                  <Plus size={14} className="inline mr-1.5 -mt-0.5" />
                  Add Group
                </button>
              </div>
            ) : (
              sortedGroups.map((group) => {
                const groupItems = filteredItems
                  .filter((item) => item.group_id === group.id);

                return (
                  <GroupSection
                    key={group.id}
                    group={group}
                    items={groupItems}
                    allItems={allItems}
                    columns={columns}
                    profiles={profiles}
                    editingGroupId={editingGroupId}
                    editGroupTitle={editGroupTitle}
                    addingToGroupId={addingToGroupId}
                    newItemName={newItemName}
                    activeStatusId={activeStatusId}
                    showAddColumnMenu={showAddColumnMenu}
                    itemMenuOpen={itemMenuOpen}
                    onSetEditingGroup={onSetEditingGroup}
                    onRenameGroup={onRenameGroup}
                    onDeleteGroup={onDeleteGroup}
                    onSetAddingToGroup={onSetAddingToGroup}
                    onSetNewItemName={onSetNewItemName}
                    onAddItem={onAddItem}
                    onUpdateCell={onUpdateCell}
                    onSelectItem={onSelectItem}
                    onDuplicateItem={onDuplicateItem}
                    onDeleteItem={onDeleteItem}
                    onSetActiveStatusId={onSetActiveStatusId}
                    onSetShowAddColumnMenu={onSetShowAddColumnMenu}
                    onSetItemMenuOpen={onSetItemMenuOpen}
                    onChangeGroupColor={onChangeGroupColor}
                    onAddColumn={onAddColumn}
                    onRenameColumn={onRenameColumn}
                    onResizeColumn={onResizeColumn}
                    onDeleteColumn={onDeleteColumn}
                    itemNameColumn={itemNameColumn}
                    onRenameItemNameColumn={onRenameItemNameColumn}
                    onRenameItem={onRenameItem}
                    itemNameWidth={itemNameWidth}
                    onResizeItemNameColumn={handleResizeItemNameColumn}
                    draggingId={draggingId}
                    isCollapsed={collapsedGroups.includes(group.id)}
                    onToggleCollapse={() => onToggleGroupCollapse?.(group.id)}
                  />
                );
              })
            )}

            {/* Add Group Button */}
            {groups.length > 0 && (
              <button
                onClick={onAddGroup}
                className="mt-2 flex items-center px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-[#1e2140] rounded-lg border border-dashed border-gray-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 transition-all font-medium"
              >
                <Plus size={15} className="mr-2" /> Add New Group
              </button>
            )}
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
