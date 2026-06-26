"use client";

import React, { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import {
  LayoutDashboard,
  Plus,
  Bell,
  CircleUser,
  GripVertical,
  ChevronDown,
  Trash2,
  Pencil,
  Layout,
  AlignLeft,
  Calendar,
  Settings2,
  Hash,
  Users,
  LayoutList,
  Columns3,
  LogOut,
  MoreHorizontal,
  Copy,
  Filter,
  Briefcase,
  Clock,
  Tag,
  Paperclip,
  AlertTriangle,
  Link2,
  Zap,
  CheckCircle2
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Board, Group, Item, Column, ColumnType, Profile, Workspace, Notification, Automation } from "@/types";
import CellRenderer from "@/components/cells/CellRenderer";
import ColumnHeader from "@/components/ColumnHeader";
import GroupFooter from "@/components/GroupFooter";
import ItemPanel from "@/components/ItemPanel";
import KanbanView from "@/components/KanbanView";
import DashboardView from "@/components/DashboardView";
import CalendarView from "@/components/CalendarView";
import GanttView from "@/components/GanttView";
import MyWorkView from "@/components/MyWorkView";
import ProfileMenu from "@/components/ProfileMenu";
import NotificationsMenu from "@/components/NotificationsMenu";
import AutomationsModal from "@/components/AutomationsModal";
import AdminModal from "@/components/AdminModal";
import { useAuth } from "@/components/AuthProvider";

// ============================================================
// Main Application Component
// ============================================================
export default function MondayClone() {
  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);
  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupTitle, setEditGroupTitle] = useState("");
  const [showAddColumnMenu, setShowAddColumnMenu] = useState<string | null>(null);

  // --- Phase 2: Item Panel State ---
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  // --- Phase 3: View Mode State ---
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");

  // --- Phase 4: Auth ---
  const { user, profile, loading: authLoading, signOut } = useAuth();

  // --- Phase 5: Workspaces, Profiles, & Filtering ---
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPerson, setFilterPerson] = useState<string>("all");
  const [itemMenuOpen, setItemMenuOpen] = useState<string | null>(null);
  const [showWorkspaceSidebar, setShowWorkspaceSidebar] = useState(true);
  const [mainView, setMainView] = useState<"board" | "kanban" | "dashboard" | "calendar" | "gantt" | "my_work">("board");
  const [myWorkItems, setMyWorkItems] = useState<Item[]>([]);
  const [showAutomations, setShowAutomations] = useState(false);
  const [boardAutomations, setBoardAutomations] = useState<Automation[]>([]);
  const [showAdminModal, setShowAdminModal] = useState(false);

  // ============================================================
  // Data Fetching & Realtime
  // ============================================================
  useEffect(() => {
    if (authLoading) return;
    setIsMounted(true);
    fetchWorkspaces();
    fetchProfiles();
    fetchBoards();

    const channel = supabase
      .channel("realtime-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () =>
        activeBoard && fetchBoardData(activeBoard.id, true)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () =>
        activeBoard && fetchBoardData(activeBoard.id, true)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "boards" }, () =>
        fetchBoards(true)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "updates" }, () => {})
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBoard?.id, authLoading, profile]);

  const fetchWorkspaces = async () => {
    try {
      let query = supabase.from("workspaces").select("*").order("name");
      if (profile?.role === "limited") {
        if (profile.allowed_workspaces && profile.allowed_workspaces.length > 0) {
          query = query.in("id", profile.allowed_workspaces);
        } else {
          setWorkspaces([]);
          setActiveWorkspace(null);
          return;
        }
      }
      const { data } = await query;
      if (data && data.length > 0) {
        setWorkspaces(data);
        setActiveWorkspace(data[0]);
      } else {
        setWorkspaces([]);
        setActiveWorkspace(null);
      }
    } catch (err) {
      console.error("Failed to fetch workspaces", err);
    }
  };

  const handleRenameWorkspace = async (ws: Workspace) => {
    const newName = prompt("Enter new workspace name:", ws.name);
    if (newName && newName !== ws.name) {
      try {
        const { error } = await supabase.from("workspaces").update({ name: newName }).eq("id", ws.id);
        if (!error) {
          setWorkspaces(workspaces.map(w => w.id === ws.id ? { ...w, name: newName } : w));
          if (activeWorkspace?.id === ws.id) {
            setActiveWorkspace({ ...ws, name: newName });
          }
        }
      } catch (err) { console.error("Rename failed", err); }
    }
  };

  const handleDeleteWorkspace = async (ws: Workspace) => {
    if (confirm(`Are you sure you want to delete workspace "${ws.name}"? This action cannot be undone.`)) {
      try {
        const { error } = await supabase.from("workspaces").delete().eq("id", ws.id);
        if (!error) {
          const updated = workspaces.filter(w => w.id !== ws.id);
          setWorkspaces(updated);
          if (activeWorkspace?.id === ws.id) {
            setActiveWorkspace(updated.length > 0 ? updated[0] : null);
          }
        }
      } catch (err) { console.error("Delete failed", err); }
    }
  };

  const handleRenameBoard = async (board: Board) => {
    const newName = prompt("Enter new board name:", board.name);
    if (newName && newName !== board.name) {
      try {
        const { error } = await supabase.from("boards").update({ name: newName }).eq("id", board.id);
        if (!error) {
          setBoards(boards.map(b => b.id === board.id ? { ...b, name: newName } : b));
          if (activeBoard?.id === board.id) {
            setActiveBoard({ ...board, name: newName });
          }
        }
      } catch (err) { console.error("Rename failed", err); }
    }
  };

  const handleDeleteBoard = async (board: Board) => {
    if (confirm(`Are you sure you want to delete board "${board.name}"? This action cannot be undone.`)) {
      try {
        const { error } = await supabase.from("boards").delete().eq("id", board.id);
        if (!error) {
          const updated = boards.filter(b => b.id !== board.id);
          setBoards(updated);
          if (activeBoard?.id === board.id) {
            setActiveBoard(updated.length > 0 ? updated[0] : null);
          }
        }
      } catch (err) { console.error("Delete failed", err); }
    }
  };

  const fetchProfiles = async () => {
    try {
      const { data } = await supabase.from("profiles").select("*");
      if (data) setProfiles(data);
    } catch (err) {
      console.error("Failed to fetch profiles", err);
    }
  };

  const fetchBoards = async (silent = false) => {
    if (!silent && !activeBoard) setLoading(true);
    try {
      let query = supabase.from("boards").select("*").order("id");
      if (profile?.role === "limited") {
        if (profile.allowed_boards && profile.allowed_boards.length > 0) {
          query = query.in("id", profile.allowed_boards);
        } else {
          setBoards([]);
          setActiveBoard(null);
          setLoading(false);
          return;
        }
      }
      const { data } = await query;
      if (data && data.length > 0) {
        setBoards(data);
        if (!activeBoard) {
          setActiveBoard(data[0]);
          fetchBoardData(data[0].id, silent);
        } else {
          const updatedActive = data.find((b) => b.id === activeBoard.id);
          if (updatedActive) setActiveBoard(updatedActive);
        }
      } else {
        setBoards([]);
        setActiveBoard(null);
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching boards:", error);
      setLoading(false);
    }
  };

  const fetchBoardData = async (boardId: string, silent = false) => {
    try {
      const { data: groupsData } = await supabase
        .from("groups")
        .select("*")
        .eq("board_id", boardId)
        .order("position");
      if (groupsData) setGroups(groupsData);

      const { data: itemsData } = await supabase
        .from("items")
        .select("*")
        .eq("board_id", boardId)
        .order("position");
      if (itemsData) setItems(itemsData);

      const { data: automationsData } = await supabase
        .from("automations")
        .select("*")
        .eq("board_id", boardId);
      if (automationsData) setBoardAutomations(automationsData);
    } catch (error) {
      console.error("Error fetching board data:", error);
    }
    if (!silent) setLoading(false);
  };

  const fetchMyWorkItems = async () => {
    if (!profile) return;
    try {
      const { data } = await supabase.from("items").select("*");
      if (data) {
        const myItems = data.filter((item) => {
          const board = boards.find(b => b.id === item.board_id);
          if (!board) return false;
          const peopleCols = board.columns.filter(c => c.type === "people");
          return peopleCols.some((col) => {
            const val = item.column_values?.[col.id];
            return Array.isArray(val) && val.includes(profile.id);
          });
        });
        setMyWorkItems(myItems);
      }
    } catch (err) {
      console.error("Failed to fetch my work items:", err);
    }
  };

  useEffect(() => {
    if (mainView === "my_work") {
      fetchMyWorkItems();
    }
  }, [mainView, profile, boards]);

  const handleSwitchBoard = (board: Board) => {
    setActiveBoard(board);
    setGroups([]);
    setItems([]);
    fetchBoardData(board.id);
    setMainView("board");
  };

  const handleAddColumn = async (type: ColumnType) => {
    if (!activeBoard) return;
    setShowAddColumnMenu(null);

    const newColId = `${type}_${Date.now()}`;
    let newColTitle = type.charAt(0).toUpperCase() + type.slice(1);
    if (type === "people") newColTitle = "Assignee";
    if (type === "numbers") newColTitle = "Numbers";
    if (type === "timeline") newColTitle = "Timeline";
    if (type === "tags") newColTitle = "Tags";
    if (type === "files") newColTitle = "Files";
    if (type === "priority") newColTitle = "Priority";
    if (type === "dependency") newColTitle = "Dependency";

    const currentColumns = activeBoard.columns || [];
    const newColumn: Column = { id: newColId, title: newColTitle, type };
    const updatedColumns = [...currentColumns, newColumn];

    setActiveBoard({ ...activeBoard, columns: updatedColumns });

    try {
      await supabase.from("boards").update({ columns: updatedColumns }).eq("id", activeBoard.id);
    } catch (error) {
      console.error("Failed to add column", error);
    }
  };

  const handleRenameColumn = async (columnId: string, newTitle: string) => {
    if (!activeBoard) return;

    const currentColumns = activeBoard.columns || [];
    const updatedColumns = currentColumns.map((col) =>
      col.id === columnId ? { ...col, title: newTitle } : col
    );

    setActiveBoard({ ...activeBoard, columns: updatedColumns });

    try {
      await supabase.from("boards").update({ columns: updatedColumns }).eq("id", activeBoard.id);
    } catch (error) {
      console.error("Failed to rename column", error);
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!activeBoard || !window.confirm("Are you sure you want to delete this column?")) return;

    const currentColumns = activeBoard.columns || [];
    const updatedColumns = currentColumns.filter((col) => col.id !== columnId);

    setActiveBoard({ ...activeBoard, columns: updatedColumns });

    try {
      await supabase.from("boards").update({ columns: updatedColumns }).eq("id", activeBoard.id);
    } catch (error) {
      console.error("Failed to delete column", error);
    }
  };

  const handleReorderColumns = async (startIndex: number, endIndex: number) => {
    if (!activeBoard) return;

    const currentColumns = [...(activeBoard.columns || [])];
    const [movedCol] = currentColumns.splice(startIndex, 1);
    currentColumns.splice(endIndex, 0, movedCol);

    setActiveBoard({ ...activeBoard, columns: currentColumns });

    try {
      await supabase.from("boards").update({ columns: currentColumns }).eq("id", activeBoard.id);
    } catch (error) {
      console.error("Failed to reorder columns", error);
    }
  };

  const handleUpdateCell = async (itemId: string, columnId: string, newValue: any) => {
    if (activeStatusId) setActiveStatusId(null);
    const itemIndex = items.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) return;

    const itemToUpdate = items[itemIndex];
    const existingValues = itemToUpdate.column_values || {};
    const updatedValues = { ...existingValues, [columnId]: newValue };

    const newItems = [...items];
    newItems[itemIndex] = { ...itemToUpdate, column_values: updatedValues };
    setItems(newItems);

    const isPeopleColumn = activeBoard?.columns?.find(c => c.id === columnId)?.type === "people";
    const newlyAssigned = Array.isArray(newValue) && isPeopleColumn 
      ? newValue.filter(id => !Array.isArray(existingValues[columnId]) || !existingValues[columnId].includes(id))
      : [];

    try {
      let targetGroupId = itemToUpdate.group_id;
      
      const matchedRule = boardAutomations.find(a => 
        a.trigger_column_id === columnId && 
        newValue === a.trigger_value && 
        a.action_type === "move_group"
      );

      if (matchedRule) {
        targetGroupId = matchedRule.action_target_id;
        newItems[itemIndex].group_id = targetGroupId;
        setItems([...newItems]);
      }

      await supabase.from("items").update({ 
        column_values: updatedValues,
        group_id: targetGroupId
      }).eq("id", itemId);
      
      const colName = activeBoard?.columns.find(c => c.id === columnId)?.title || columnId;
      const oldValue = existingValues[columnId] || "Empty";
      const actionMsg = `Changed "${colName}" from "${oldValue}" to "${newValue}"`;
      
      await supabase.from("activity_logs").insert({
        item_id: itemId,
        board_id: activeBoard!.id,
        user_id: profile!.id,
        action: actionMsg
      });

      if (newlyAssigned.length > 0 && profile) {
        const notifications = newlyAssigned.map(userId => ({
          user_id: userId,
          message: `${profile.full_name} assigned you to the task "${itemToUpdate.name}".`
        }));
        await supabase.from("notifications").insert(notifications);
      }
    } catch (error) {
      console.error("Failed to update cell", error);
    }
  };

  const handleCreateBoard = async () => {
    const boardName = prompt("Enter new board name:");
    if (!boardName) return;
    const { data: wsData } = await supabase.from("workspaces").select("id").limit(1).single();

    const defaultColumns: Column[] = [
      { id: "status", title: "Status", type: "status" },
      { id: "date", title: "Date", type: "date" },
    ];

    try {
      const { data, error } = await supabase
        .from("boards")
        .insert({
          name: boardName,
          description: "New project board",
          workspace_id: wsData?.id,
          columns: defaultColumns,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setBoards([...boards, data]);
        handleSwitchBoard(data);
      }
    } catch (error) {
      console.error("Failed to create board:", error);
    }
  };

  const handleRenameGroup = async (groupId: string) => {
    if (!editGroupTitle.trim()) return setEditingGroupId(null);
    setGroups(groups.map((g) => (g.id === groupId ? { ...g, title: editGroupTitle } : g)));
    setEditingGroupId(null);
    try {
      await supabase.from("groups").update({ title: editGroupTitle }).eq("id", groupId);
    } catch (error) {
      console.error("Failed to rename group", error);
    }
  };

  const handleAddItem = async (groupId: string) => {
    if (!newItemName.trim() || !activeBoard) return;
    const tempId = `temp-${Date.now()}`;
    const newItem: Item = {
      id: tempId,
      board_id: activeBoard.id,
      group_id: groupId,
      name: newItemName,
      column_values: {},
      position: items.filter((i) => i.group_id === groupId).length,
    };
    setItems([...items, newItem]);
    setNewItemName("");
    setAddingToGroupId(null);
    try {
      const { data, error } = await supabase
        .from("items")
        .insert({
          board_id: newItem.board_id,
          group_id: newItem.group_id,
          name: newItem.name,
          position: newItem.position,
          column_values: newItem.column_values,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) setItems((prev) => prev.map((item) => (item.id === tempId ? data : item)));
    } catch (error) {
      setItems((prev) => prev.filter((item) => item.id !== tempId));
    }
  };

  const handleAddGroup = async () => {
    if (!activeBoard) return;
    const randomColors = ["#579bfc", "#00c875", "#e2445c", "#fdab3d", "#a25ddc", "#0086c0"];
    const tempId = `temp-group-${Date.now()}`;
    const newGroup: Group = {
      id: tempId,
      title: "New Group",
      color: randomColors[Math.floor(Math.random() * randomColors.length)],
      position: groups.length,
      board_id: activeBoard.id,
    };
    setGroups([...groups, newGroup]);
    try {
      const { data, error } = await supabase
        .from("groups")
        .insert({
          board_id: activeBoard.id,
          title: newGroup.title,
          color: newGroup.color,
          position: newGroup.position,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) setGroups((prev) => prev.map((g) => (g.id === tempId ? data : g)));
    } catch (err) {
      setGroups((prev) => prev.filter((g) => g.id !== tempId));
    }
  };

  const handleDuplicateItem = async (item: Item) => {
    setItemMenuOpen(null);
    if (!activeBoard) return;
    const tempId = `temp-dup-${Date.now()}`;
    const duplicate: Item = {
      ...item,
      id: tempId,
      name: `${item.name} (Copy)`,
      position: item.position + 1,
    };
    
    const newItems = [...items];
    const originalIndex = newItems.findIndex(i => i.id === item.id);
    if (originalIndex !== -1) {
      newItems.splice(originalIndex + 1, 0, duplicate);
    } else {
      newItems.push(duplicate);
    }
    setItems(newItems);

    try {
      const { data, error } = await supabase
        .from("items")
        .insert({
          board_id: duplicate.board_id,
          group_id: duplicate.group_id,
          name: duplicate.name,
          position: duplicate.position,
          column_values: duplicate.column_values,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) setItems((prev) => prev.map((i) => (i.id === tempId ? data : i)));
    } catch (error) {
      setItems((prev) => prev.filter((i) => i.id !== tempId));
      console.error("Failed to duplicate item", error);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    setItems(items.filter((item) => item.id !== itemId));
    try {
      await supabase.from("items").delete().eq("id", itemId);
    } catch (error) {
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm("Are you sure you want to delete this group?")) return;
    setGroups(groups.filter((g) => g.id !== groupId));
    setItems(items.filter((i) => i.group_id !== groupId));
    try {
      await supabase.from("items").delete().eq("group_id", groupId);
      await supabase.from("groups").delete().eq("id", groupId);
    } catch (error) {
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === "COLUMN") {
      handleReorderColumns(source.index, destination.index);
      return;
    }

    const newItems = Array.from(items);
    const draggedItemIndex = newItems.findIndex((item) => item.id === draggableId);
    if (draggedItemIndex === -1) return;
    const draggedItem = newItems[draggedItemIndex];
    draggedItem.group_id = destination.droppableId;
    newItems.splice(draggedItemIndex, 1);
    const itemsInDestGroup = newItems.filter((item) => item.group_id === destination.droppableId);
    itemsInDestGroup.splice(destination.index, 0, draggedItem);
    setItems(
      newItems
        .filter((item) => item.group_id !== destination.droppableId)
        .concat(itemsInDestGroup)
    );
    try {
      await supabase.from("items").update({ group_id: destination.droppableId }).eq("id", draggableId);
    } catch (error) {
    }
  };

  if (!isMounted) return null;
  if (loading || authLoading)
    return (
      <div className="flex items-center justify-center h-screen bg-[#f5f6f8] text-gray-500 dark:text-gray-400 font-medium">
        Loading workspace...
      </div>
    );

  const activeColumns: Column[] = activeBoard?.columns || [];

  const filteredItems = items.filter((item) => {
    let match = true;
    if (filterStatus !== "all") {
      const statusValue = item.column_values?.["status"];
      if (filterStatus === "empty") {
        if (statusValue && statusValue !== "Empty") match = false;
      } else {
        if (statusValue !== filterStatus) match = false;
      }
    }
    if (filterPerson !== "all") {
      const peopleCol = activeColumns.find(c => c.type === "people");
      if (peopleCol) {
        const assignedIds = item.column_values?.[peopleCol.id] || [];
        if (!assignedIds.includes(filterPerson)) match = false;
      } else {
        match = false;
      }
    }
    return match;
  });

  const visibleBoards = activeWorkspace
    ? boards.filter(b => b.workspace_id === activeWorkspace.id)
    : boards;

  return (
    <div className="flex h-screen w-screen overflow-visible bg-white dark:bg-slate-900">
      <div className="w-16 bg-[#292f4c] text-white flex flex-col items-center py-4 justify-between shrink-0 relative z-50">
        <div className="flex flex-col items-center space-y-6 w-full">
          <div 
            className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-lg select-none cursor-pointer hover:bg-blue-600 transition-colors"
            onClick={() => setShowWorkspaceSidebar(!showWorkspaceSidebar)}
          >
            M
          </div>
          <div 
            onClick={() => setMainView(mainView === "my_work" ? "board" : "my_work")}
            className={`w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer transition ${mainView === 'my_work' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-slate-900/10 text-white hover:bg-white dark:bg-slate-900/20'}`}
          >
            <LayoutDashboard size={20} />
          </div>
        </div>
        <div className="flex flex-col items-center space-y-4">
          {profile ? (
            <NotificationsMenu userId={profile.id} />
          ) : (
            <div className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-slate-900/20 cursor-pointer text-gray-300 hover:text-white transition">
              <Bell size={20} />
            </div>
          )}
          {profile ? (
            <ProfileMenu profile={profile} onSignOut={signOut} onOpenAdmin={() => setShowAdminModal(true)} />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-600 border-2 border-[#292f4c] animate-pulse"></div>
          )}
        </div>
      </div>

      {showWorkspaceSidebar && (
      <div className="w-64 bg-gray-50 dark:bg-slate-800 border-r border-gray-200 dark:border-slate-600 flex flex-col shrink-0 z-10">
        <div className="h-14 border-b border-gray-200 dark:border-slate-600 flex items-center px-4 font-semibold text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:bg-slate-700 transition-colors relative group">
          <Briefcase size={16} className="mr-2 text-blue-500" />
          <span className="truncate flex-1">{activeWorkspace ? activeWorkspace.name : "Main Workspace"}</span>
          <ChevronDown size={14} className="text-gray-400 dark:text-gray-500" />
          
          <div className="absolute top-full left-0 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-600 shadow-lg rounded-b-lg hidden group-hover:block z-50">
            {workspaces.map(ws => (
              <div 
                key={ws.id} 
                className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 text-sm group/ws flex justify-between items-center"
              >
                <div 
                  className="flex-1 cursor-pointer truncate mr-2" 
                  onClick={() => { setActiveWorkspace(ws); setMainView("board"); }}
                >
                  {ws.name}
                </div>
                <div className="hidden group-hover/ws:flex items-center gap-2">
                  <Pencil size={14} className="text-gray-400 hover:text-blue-500 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleRenameWorkspace(ws); }} />
                  {profile?.role === 'admin' && (
                    <Trash2 size={14} className="text-gray-400 hover:text-red-500 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleDeleteWorkspace(ws); }} />
                  )}
                </div>
              </div>
            ))}
            <div 
              onClick={async () => {
                const name = prompt("New Workspace Name:");
                if (name) {
                  const { data } = await supabase.from("workspaces").insert({ name }).select().single();
                  if (data) {
                    setWorkspaces([...workspaces, data]);
                    setActiveWorkspace(data);
                  }
                }
              }}
              className="px-4 py-2 border-t border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:bg-slate-800 text-sm text-blue-600 flex items-center"
            >
              <Plus size={14} className="mr-1" /> New Workspace
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4 bg-gray-50 dark:bg-slate-800">
          <div className="px-4 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex justify-between items-center">
            <span>Boards</span>
            <button
              onClick={handleCreateBoard}
              className="hover:bg-gray-200 dark:bg-slate-600 p-1 rounded transition-colors"
              title="Create Board"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1 px-2">
            {visibleBoards.map((b) => (
              <div
                key={b.id}
                className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors group/board ${
                  activeBoard?.id === b.id
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:bg-slate-600"
                }`}
              >
                <div 
                  className="flex items-center space-x-3 cursor-pointer flex-1 truncate mr-2"
                  onClick={() => handleSwitchBoard(b)}
                >
                  <Layout
                    size={16}
                    className={activeBoard?.id === b.id ? "text-blue-600" : "text-gray-400 dark:text-gray-500"}
                  />
                  <span className="truncate">{b.name}</span>
                </div>
                <div className="hidden group-hover/board:flex items-center gap-2">
                  <Pencil size={14} className="text-gray-400 hover:text-blue-500 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleRenameBoard(b); }} />
                  {profile?.role === 'admin' && (
                    <Trash2 size={14} className="text-gray-400 hover:text-red-500 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleDeleteBoard(b); }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {mainView === "my_work" ? (
        <MyWorkView items={myWorkItems} boards={boards} onSelectItem={setSelectedItem} />
      ) : (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900">
        {activeBoard ? (
          <>
            <div className="h-14 border-b border-gray-200 dark:border-slate-600 flex items-center justify-between px-6 shrink-0">
              <h1 className="text-xl font-bold">{activeBoard.name}</h1>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setMainView("board")}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    mainView === "board"
                      ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  Main Table
                </button>
                <button
                  onClick={() => setMainView("kanban")}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    mainView === "kanban"
                      ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  Kanban
                </button>
                <button
                  onClick={() => setMainView("dashboard")}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center ${
                    mainView === "dashboard"
                      ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setMainView("calendar")}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center ${
                    mainView === "calendar"
                      ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  Calendar
                </button>
                <button
                  onClick={() => setMainView("gantt")}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center ${
                    mainView === "gantt"
                      ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  Gantt
                </button>
              </div>
              <div className="flex items-center">
                <button 
                  onClick={() => setShowAutomations(true)}
                  className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                >
                  <Zap size={14} className="mr-2 text-purple-500" /> Automate
                </button>
              </div>
            </div>

            {(mainView === "board" || mainView === "kanban") && (
              <div className="px-6 py-2 border-b border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 flex items-center gap-4 shrink-0">
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 font-medium">
                  <Filter size={14} className="mr-2" />
                  Filter by:
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-sm border-gray-300 dark:border-slate-500 rounded-md shadow-sm dark:shadow-none focus:ring-blue-500 focus:border-blue-500 py-1 pl-2 pr-8"
                >
                  <option value="all">All Statuses</option>
                  <option value="Working on it">Working on it</option>
                  <option value="Done">Done</option>
                  <option value="Stuck">Stuck</option>
                  <option value="empty">Empty</option>
                </select>

                {activeColumns.some(c => c.type === "people") && (
                  <select
                    value={filterPerson}
                    onChange={(e) => setFilterPerson(e.target.value)}
                    className="text-sm border-gray-300 dark:border-slate-500 rounded-md shadow-sm dark:shadow-none focus:ring-blue-500 focus:border-blue-500 py-1 pl-2 pr-8"
                  >
                    <option value="all">All People</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {mainView === "board" && (
            <div
              className="flex-1 overflow-auto p-8 bg-[#f5f6f8] dark:bg-slate-950"
              onClick={() => {
                if (activeStatusId) setActiveStatusId(null);
                setShowAddColumnMenu(null);
              }}
            >
              <div className="max-w-[1600px] space-y-10 pb-20 w-max min-w-full">
                <DragDropContext onDragEnd={onDragEnd}>
                  {groups.map((group, groupIndex) => {
                    const groupItems = filteredItems.filter((i) => i.group_id === group.id);
                    return (
                      <div key={group.id} className="flex flex-col mb-8 relative group/group-container" style={{ zIndex: showAddColumnMenu === group.id ? 50 : 40 - groupIndex }}>
                        <div className="flex items-center justify-between mb-2 group">
                          <div className="flex items-center space-x-2">
                            <ChevronDown
                              size={20}
                              style={{ color: group.color }}
                              className="cursor-pointer"
                            />
                            {editingGroupId === group.id ? (
                              <input
                                autoFocus
                                value={editGroupTitle}
                                onChange={(e) => setEditGroupTitle(e.target.value)}
                                onBlur={() => handleRenameGroup(group.id)}
                                onKeyDown={(e) =>
                                  e.key === "Enter" && handleRenameGroup(group.id)
                                }
                                className="text-lg font-medium outline-none bg-white dark:bg-slate-900 border border-blue-500 rounded px-1 -ml-1"
                                style={{ color: group.color }}
                              />
                            ) : (
                              <h2
                                onClick={() => {
                                  setEditingGroupId(group.id);
                                  setEditGroupTitle(group.title);
                                }}
                                className="text-lg font-medium cursor-text border border-transparent hover:border-gray-300 dark:border-slate-500 rounded px-1 -ml-1 transition-colors"
                                style={{ color: group.color }}
                              >
                                {group.title}
                              </h2>
                            )}
                            <span className="text-gray-400 dark:text-gray-500 text-sm opacity-0 group-hover:opacity-100 transition">
                              {groupItems.length} Items
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteGroup(group.id)}
                            className="text-gray-400 dark:text-gray-500 hover:text-red-500 opacity-0 group-hover/group-container:opacity-100 transition-opacity p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-md border border-gray-200 dark:border-slate-600 shadow-sm dark:shadow-none flex flex-col">
                          <div className="flex border-b border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-medium text-gray-500 dark:text-gray-400 rounded-t-md">
                            <div
                              className="w-8 shrink-0 flex items-center justify-center border-r border-gray-200 dark:border-slate-600"
                              style={{ backgroundColor: group.color }}
                            ></div>

                            <div className="w-[300px] p-2 pl-4 border-r border-gray-200 dark:border-slate-600 shrink-0">
                              Item Name
                            </div>

                            <Droppable
                              droppableId={`columns-${group.id}`}
                              type="COLUMN"
                              direction="horizontal"
                            >
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className="flex"
                                >
                                  {activeColumns.map((col, colIndex) => (
                                    <Draggable
                                      key={col.id}
                                      draggableId={`col-${group.id}-${col.id}`}
                                      index={colIndex}
                                    >
                                      {(provided) => (
                                        <div
                                          ref={provided.innerRef}
                                          {...provided.draggableProps}
                                        >
                                          <ColumnHeader
                                            column={col}
                                            dragHandleProps={provided.dragHandleProps}
                                            onRename={handleRenameColumn}
                                            onDelete={handleDeleteColumn}
                                          />
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>

                            <div
                              className="relative w-16 flex items-center justify-center hover:bg-gray-100 dark:bg-slate-700 cursor-pointer transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowAddColumnMenu(showAddColumnMenu === group.id ? null : group.id);
                              }}
                            >
                              <Plus size={16} />
                              {showAddColumnMenu === group.id && (
                                <div className="absolute top-10 right-0 w-52 bg-white dark:bg-slate-900 shadow-xl rounded-lg border border-gray-200 dark:border-slate-600 p-2 z-50 flex flex-col space-y-0.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 px-2 uppercase tracking-wider">
                                    Add new column
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddColumn("status"); }}
                                    className="flex items-center px-2 py-2 hover:bg-gray-50 dark:bg-slate-800 rounded-md text-sm text-gray-700 dark:text-gray-200 text-left transition-colors"
                                  >
                                    <Settings2 size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                                    Status
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddColumn("text"); }}
                                    className="flex items-center px-2 py-2 hover:bg-gray-50 dark:bg-slate-800 rounded-md text-sm text-gray-700 dark:text-gray-200 text-left transition-colors"
                                  >
                                    <AlignLeft size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                                    Text
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddColumn("numbers"); }}
                                    className="flex items-center px-2 py-2 hover:bg-gray-50 dark:bg-slate-800 rounded-md text-sm text-gray-700 dark:text-gray-200 text-left transition-colors"
                                  >
                                    <Hash size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                                    Numbers
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddColumn("date"); }}
                                    className="flex items-center px-2 py-2 hover:bg-gray-50 dark:bg-slate-800 rounded-md text-sm text-gray-700 dark:text-gray-200 text-left transition-colors"
                                  >
                                    <Calendar size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                                    Date
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddColumn("people"); }}
                                    className="flex items-center px-2 py-2 hover:bg-gray-50 dark:bg-slate-800 rounded-md text-sm text-gray-700 dark:text-gray-200 text-left transition-colors"
                                  >
                                    <Users size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                                    People
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddColumn("timeline"); }}
                                    className="flex items-center px-2 py-2 hover:bg-gray-50 dark:bg-slate-800 rounded-md text-sm text-gray-700 dark:text-gray-200 text-left transition-colors"
                                  >
                                    <Clock size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                                    Timeline
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddColumn("tags"); }}
                                    className="flex items-center px-2 py-2 hover:bg-gray-50 dark:bg-slate-800 rounded-md text-sm text-gray-700 dark:text-gray-200 text-left transition-colors"
                                  >
                                    <Tag size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                                    Tags
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddColumn("priority"); }}
                                    className="flex items-center px-2 py-2 hover:bg-gray-50 dark:bg-slate-800 rounded-md text-sm text-gray-700 dark:text-gray-200 text-left transition-colors"
                                  >
                                    <AlertTriangle size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                                    Priority
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddColumn("files"); }}
                                    className="flex items-center px-2 py-2 hover:bg-gray-50 dark:bg-slate-800 rounded-md text-sm text-gray-700 dark:text-gray-200 text-left transition-colors"
                                  >
                                    <Paperclip size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                                    Files
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddColumn("dependency"); }}
                                    className="flex items-center px-2 py-2 hover:bg-gray-50 dark:bg-slate-800 rounded-md text-sm text-gray-700 dark:text-gray-200 text-left transition-colors"
                                  >
                                    <Link2 size={14} className="mr-2.5 text-gray-400 dark:text-gray-500" />
                                    Dependency
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          <Droppable droppableId={group.id} type="ITEM">
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className="min-h-[40px]"
                              >
                                {groupItems.map((item, index) => (
                                  <Draggable key={item.id} draggableId={item.id} index={index}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`flex border-b border-gray-100 dark:border-slate-700 group/row transition-colors ${
                                          snapshot.isDragging
                                            ? "shadow-lg ring-1 ring-blue-500 z-50 bg-white dark:bg-slate-900"
                                            : "hover:bg-gray-50 dark:hover:bg-slate-800"
                                        }`}
                                      >
                                        <div
                                          {...provided.dragHandleProps}
                                          className="w-8 shrink-0 flex items-center justify-center border-r border-gray-200 dark:border-slate-600 relative"
                                          style={{ backgroundColor: `${group.color}20` }}
                                        >
                                          <div
                                            className="absolute left-0 top-0 bottom-0 w-1"
                                            style={{ backgroundColor: group.color }}
                                          ></div>
                                          <GripVertical
                                            size={16}
                                            className="text-gray-400 dark:text-gray-500 opacity-0 group-hover/row:opacity-100 cursor-grab active:cursor-grabbing"
                                          />
                                        </div>

                                        <div className="w-[300px] p-2 pl-4 border-r border-gray-200 dark:border-slate-600 flex items-center shrink-0">
                                          <span
                                            className="text-sm truncate cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                                            onClick={() => setSelectedItem(item)}
                                          >
                                            {item.name}
                                          </span>
                                        </div>

                                        {activeColumns.map((col) => (
                                          <React.Fragment key={`${item.id}-${col.id}`}>
                                            <CellRenderer
                                              item={item}
                                              column={col}
                                              activeStatusId={activeStatusId}
                                              setActiveStatusId={setActiveStatusId}
                                              onUpdate={handleUpdateCell}
                                              profiles={profiles}
                                              boardItems={filteredItems}
                                            />
                                          </React.Fragment>
                                        ))}

                                        <div className="w-16 flex items-center justify-center relative shrink-0">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setItemMenuOpen(itemMenuOpen === item.id ? null : item.id); }}
                                            className="opacity-0 group-hover/row:opacity-100 hover:bg-gray-200 dark:bg-slate-600 p-1 rounded transition-all text-gray-500 dark:text-gray-400"
                                          >
                                            <MoreHorizontal size={16} />
                                          </button>
                                          
                                          {itemMenuOpen === item.id && (
                                            <div className="absolute right-8 top-0 mt-2 w-36 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-gray-100 dark:border-slate-700 z-50 py-1">
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleDuplicateItem(item); }}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:bg-slate-800 flex items-center"
                                              >
                                                <Copy size={14} className="mr-2 text-gray-400 dark:text-gray-500" />
                                                Duplicate
                                              </button>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); setItemMenuOpen(null); }}
                                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                                              >
                                                <Trash2 size={14} className="mr-2 text-red-400" />
                                                Delete
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}

                                <div className="flex bg-white dark:bg-slate-900 hover:bg-gray-50 dark:bg-slate-800 transition-colors">
                                  <div
                                    className="w-8 shrink-0 border-r border-gray-200 dark:border-slate-600 relative"
                                    style={{ backgroundColor: `${group.color}20` }}
                                  >
                                    <div
                                      className="absolute left-0 top-0 bottom-0 w-1"
                                      style={{ backgroundColor: group.color }}
                                    ></div>
                                  </div>
                                  <div className="w-[300px] p-2 pl-4 border-r border-gray-200 dark:border-slate-600 flex items-center shrink-0">
                                    {addingToGroupId === group.id ? (
                                      <input
                                        type="text"
                                        autoFocus
                                        placeholder="Type and press Enter..."
                                        className="w-full text-sm outline-none bg-transparent"
                                        value={newItemName}
                                        onChange={(e) => setNewItemName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleAddItem(group.id);
                                          if (e.key === "Escape") {
                                            setAddingToGroupId(null);
                                            setNewItemName("");
                                          }
                                        }}
                                        onBlur={() => handleAddItem(group.id)}
                                      />
                                    ) : (
                                      <div
                                        onClick={() => setAddingToGroupId(group.id)}
                                        className="text-sm text-gray-400 dark:text-gray-500 flex items-center cursor-pointer hover:text-gray-600 dark:text-gray-300 w-full h-full"
                                      >
                                        <Plus size={16} className="mr-1" /> Add Item
                                      </div>
                                    )}
                                  </div>
                                  {activeColumns.map((col) => (
                                    <div
                                      key={col.id}
                                      className={`border-r border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/50 shrink-0 ${
                                        col.type === "text"
                                          ? "w-48"
                                          : col.type === "people"
                                          ? "w-36"
                                          : "w-32"
                                      }`}
                                    ></div>
                                  ))}
                                  <div className="w-16 bg-gray-50 dark:bg-slate-800/50"></div>
                                </div>
                              </div>
                            )}
                          </Droppable>

                          <GroupFooter
                            columns={activeColumns}
                            items={groupItems}
                            groupColor={group.color}
                          />
                        </div>
                      </div>
                    );
                  })}
                </DragDropContext>

                <div className="flex mt-8">
                  <button
                    onClick={handleAddGroup}
                    className="flex items-center px-4 py-2 text-sm font-medium border border-gray-300 dark:border-slate-500 rounded hover:bg-white dark:bg-slate-900 transition text-gray-700 dark:text-gray-200 shadow-sm dark:shadow-none bg-gray-50 dark:bg-slate-800"
                  >
                    <Plus size={16} className="mr-2" /> Add new group
                  </button>
                </div>
              </div>
            </div>
            )}

            {mainView === "kanban" && activeBoard && (
              <KanbanView
                columns={activeColumns}
                groups={groups}
                items={filteredItems}
                onUpdateCell={handleUpdateCell}
                onSelectItem={setSelectedItem}
                profiles={profiles}
              />
            )}

            {mainView === "dashboard" && activeBoard && (
              <DashboardView
                board={activeBoard}
                groups={groups}
                items={filteredItems}
              />
            )}

            {mainView === "calendar" && activeBoard && (
              <CalendarView
                board={activeBoard}
                groups={groups}
                items={filteredItems}
              />
            )}

            {mainView === "gantt" && activeBoard && (
              <GanttView
                board={activeBoard}
                groups={groups}
                items={filteredItems}
              />
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <Layout size={48} className="text-gray-300 mb-4" />
            <h2 className="text-xl font-medium text-gray-700 dark:text-gray-200 mb-2">No boards found</h2>
            <button
              onClick={handleCreateBoard}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
            >
              <Plus size={16} className="mr-2" /> Create Board
            </button>
          </div>
        )}
      </div>
      )}

      {/* ============================== */}
      {/* 4. Automations Modal           */}
      {/* ============================== */}
      {showAutomations && activeBoard && (
        <AutomationsModal
          board={activeBoard}
          groups={groups}
          onClose={() => {
            setShowAutomations(false);
            fetchBoardData(activeBoard.id, true);
          }}
        />
      )}

      {/* Admin Settings Modal */}
      {showAdminModal && (
        <AdminModal onClose={() => setShowAdminModal(false)} />
      )}

      {/* ============================== */}
      {/* 5. Item Updates Side Panel     */}
      {/* ============================== */}
      {selectedItem && profile && (
        <ItemPanel
          item={selectedItem}
          columns={activeColumns}
          currentUser={{
            id: profile.id,
            name: profile.full_name,
            avatar: profile.avatar_initials,
            color: profile.color,
          }}
          profiles={profiles}
          onClose={() => setSelectedItem(null)}
          onUpdateCell={handleUpdateCell}
        />
      )}
    </div>
  );
}