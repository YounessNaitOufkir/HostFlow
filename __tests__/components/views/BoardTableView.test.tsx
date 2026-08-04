import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import BoardTableView from "@/components/views/BoardTableView";
import type { Board, Group, Item, Column } from "@/types";

describe("BoardTableView & Column Operations — Batch 2.3", () => {
  const mockGroups: Group[] = [
    {
      id: "group-1",
      board_id: "board-1",
      title: "To Do Group",
      color: "#579bfc",
      position: 0,
    },
  ];

  const mockColumns: Column[] = [
    { id: "status", title: "Status", type: "status" },
    { id: "date", title: "Date", type: "date" },
  ];

  const mockItems: Item[] = [
    {
      id: "item-1",
      board_id: "board-1",
      group_id: "group-1",
      name: "First Task",
      position: 0,
      column_values: { status: "Done" },
    },
  ];

  const defaultProps = {
    boardId: "board-1",
    boardName: "Test Board",
    groups: mockGroups,
    filteredItems: mockItems,
    allItems: mockItems,
    columns: mockColumns,
    profiles: [],
    boardAutomations: [],
    editingGroupId: null,
    editGroupTitle: "",
    addingToGroupId: null,
    newItemName: "",
    activeStatusId: null,
    showAddColumnMenu: null,
    itemMenuOpen: null,
    onSetEditingGroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onDeleteGroup: vi.fn(),
    onSetAddingToGroup: vi.fn(),
    onSetNewItemName: vi.fn(),
    onAddItem: vi.fn(),
    onUpdateCell: vi.fn(),
    onSelectItem: vi.fn(),
    onDuplicateItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onSetActiveStatusId: vi.fn(),
    onSetShowAddColumnMenu: vi.fn(),
    onSetItemMenuOpen: vi.fn(),
    onAddColumn: vi.fn(),
    onRenameColumn: vi.fn(),
    onResizeColumn: vi.fn(),
    onDeleteColumn: vi.fn(),
    onChangeGroupColor: vi.fn(),
    onAddGroup: vi.fn(),
    onDragEnd: vi.fn(),
    itemNameColumn: "Item",
    onRenameItemNameColumn: vi.fn(),
    onRenameItem: vi.fn(),
    collapsedGroups: [],
    onToggleGroupCollapse: vi.fn(),
  };

  it("renders group title and task items", () => {
    render(<BoardTableView {...defaultProps} />);

    expect(screen.getByText("To Do Group")).toBeInTheDocument();
    expect(screen.getByText("First Task")).toBeInTheDocument();
  });

  it("triggers onAddGroup when 'Add New Group' button is clicked", () => {
    const onAddGroup = vi.fn();
    render(<BoardTableView {...defaultProps} onAddGroup={onAddGroup} />);

    const btn = screen.getByText("Add New Group");
    fireEvent.click(btn);

    expect(onAddGroup).toHaveBeenCalledTimes(1);
  });

  it("renders empty state message when there are no groups", () => {
    render(<BoardTableView {...defaultProps} groups={[]} />);

    expect(screen.getByText(/no groups yet/i)).toBeInTheDocument();
  });
});
