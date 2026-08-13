import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Board, Item, ItemLink, Profile, Automation } from "@/types";
import type { BoardStoreDispatch } from "./types";
import { reportMutationError } from "@/lib/errorReporting";
import { evaluateEventAutomations, evaluateTimeAutomations } from "@/lib/automations/engine";
import { notifyTabSync } from "@/hooks/useRealtimeSync";
import { toast } from "sonner";

function getStartDateMs(val: any): number | null {
  if (!val) return null;
  if (typeof val === "string" && val.includes("-")) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  if (typeof val === "object") {
    const dateStr = val.start || val.date;
    if (dateStr) {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d.getTime();
    }
  }
  return null;
}

function shiftDateValue(val: any, diffDays: number): any {
  if (!val) return null;
  const shiftStr = (s: string) => {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const nd = new Date(d.getTime() + diffDays * 24 * 60 * 60 * 1000);
    return nd.toISOString().split("T")[0];
  };

  if (typeof val === "string" && val.includes("-")) {
    return shiftStr(val);
  }
  if (typeof val === "object") {
    const out = { ...val };
    if (out.start) out.start = shiftStr(out.start);
    if (out.end) out.end = shiftStr(out.end);
    if (out.date) out.date = shiftStr(out.date);
    return out;
  }
  return null;
}

interface UseItemMutationsProps {
  dispatch: BoardStoreDispatch;
  items: Item[];
  trashItems: Item[];
  itemLinks: ItemLink[];
  reorderColumns: (board: Board, startIndex: number, endIndex: number) => void;
}

export function useItemMutations({
  dispatch,
  items,
  trashItems,
  itemLinks,
  reorderColumns,
}: UseItemMutationsProps) {
  const queryClient = useQueryClient();
  const updateCell = useCallback(
    async (
      currentItems: Item[],
      currentItemLinks: ItemLink[],
      activeBoard: Board,
      boardAutomations: Automation[],
      profile: Profile,
      itemId: string,
      columnId: string,
      newValue: any
    ) => {
      dispatch({ type: "SET_ACTIVE_STATUS_ID", payload: null });
      const itemIndex = currentItems.findIndex((i) => i.id === itemId);
      if (itemIndex === -1) return;

      const itemToUpdate = currentItems[itemIndex];
      const existingValues = itemToUpdate.column_values || {};
      const updatedValues = { ...existingValues, [columnId]: newValue };

      const updatedItem = { ...itemToUpdate, column_values: updatedValues };
      dispatch({ type: "UPDATE_ITEM", payload: updatedItem });

      // Check for people assignment notifications
      const isPeopleColumn =
        activeBoard.columns?.find((c) => c.id === columnId)?.type === "people";
      const newlyAssigned =
        Array.isArray(newValue) && isPeopleColumn
          ? newValue.filter(
              (id: string) =>
                !Array.isArray(existingValues[columnId]) ||
                !existingValues[columnId].includes(id)
            )
          : [];

      try {
        let targetGroupId = itemToUpdate.group_id;

        // Check event-driven automation rules (move_group for Done/Completed and Cancelled/Closed, etc.)
        const eventAutomation = evaluateEventAutomations(
          activeBoard,
          itemToUpdate,
          columnId,
          existingValues[columnId],
          newValue,
          boardAutomations
        );

        if (eventAutomation.targetGroupId) {
          targetGroupId = eventAutomation.targetGroupId;
          const movedItem = { ...updatedItem, group_id: targetGroupId };
          dispatch({ type: "UPDATE_ITEM", payload: movedItem });

          if (targetGroupId !== itemToUpdate.group_id) {
            const targetGroupName = "new group";
            const originalGroupId = itemToUpdate.group_id;
            const originalValues = existingValues;

            toast.success(
              `⚡ Automation: Moved "${itemToUpdate.name}" to ${targetGroupName}`,
              {
                duration: 10000,
                action: {
                  label: "Revert",
                  onClick: async () => {
                    const revertedItem = {
                      ...itemToUpdate,
                      group_id: originalGroupId,
                      column_values: originalValues,
                    };
                    dispatch({ type: "UPDATE_ITEM", payload: revertedItem });
                    await supabase
                      .from("items")
                      .update({
                        group_id: originalGroupId,
                        column_values: originalValues,
                      })
                      .eq("id", itemId);
                    toast.info(`↩️ Reverted automation on "${itemToUpdate.name}".`);
                  },
                },
              }
            );
          }
        }

        await supabase
          .from("items")
          .update({
            column_values: updatedValues,
            group_id: targetGroupId,
          })
          .eq("id", itemId);

        // --- Combined Date & Timeline Dependency Cascading ---
        // Only cascade if the "Timeline & Date Shifting" automation is enabled for this board
        const hasTimelineShiftingAutomation = boardAutomations.some(
          (a) => a.action_type === "timeline_shifting" && a.enabled !== false
        );
        const columnDef = activeBoard.columns.find((c) => c.id === columnId);
        if (
          hasTimelineShiftingAutomation &&
          columnDef &&
          (columnDef.type === "timeline" || columnDef.type === "date")
        ) {
          const oldTime = getStartDateMs(existingValues[columnId]);
          const newTime = getStartDateMs(newValue);
          if (oldTime && newTime && newTime !== oldTime) {
            const diffDays = Math.round(
              (newTime - oldTime) / (1000 * 60 * 60 * 24)
            );

            if (diffDays !== 0) {
              const cascadeUpdates = new Map<string, any>();

              const cascade = (currentId: string, currentDiffDays: number) => {
                const childrenLinks = currentItemLinks.filter(
                  (l) =>
                    l.source_item_id === currentId &&
                    l.link_type === "dependency"
                );

                for (const link of childrenLinks) {
                  const childId = link.target_item_id;
                  const childItemIndex = currentItems.findIndex(
                    (i) => i.id === childId
                  );
                  if (childItemIndex !== -1) {
                    const childItem = currentItems[childItemIndex];
                    const currentValues =
                      cascadeUpdates.get(childId) ||
                      childItem.column_values ||
                      {};
                    const childVal = currentValues[columnId];

                    if (childVal) {
                      const shiftedVal = shiftDateValue(
                        childVal,
                        currentDiffDays
                      );
                      if (shiftedVal) {
                        const shiftedValues = {
                          ...currentValues,
                          [columnId]: shiftedVal,
                        };
                        cascadeUpdates.set(childId, shiftedValues);
                        cascade(childId, currentDiffDays);
                      }
                    }
                  }
                }
              };

              cascade(itemId, diffDays);

              if (cascadeUpdates.size > 0) {
                for (const [depId, shiftedValues] of Array.from(
                  cascadeUpdates.entries()
                )) {
                  const depItemIndex = currentItems.findIndex(
                    (i) => i.id === depId
                  );
                  if (depItemIndex !== -1) {
                    const depItem = currentItems[depItemIndex];
                    const shiftedItem = {
                      ...depItem,
                      column_values: shiftedValues,
                    };
                    dispatch({ type: "UPDATE_ITEM", payload: shiftedItem });
                    supabase
                      .from("items")
                      .update({ column_values: shiftedValues })
                      .eq("id", depId)
                      .then(({ error }) => {
                        if (error)
                          reportMutationError(
                            error,
                            "Date/Timeline cascade update failed",
                            {
                              table: "items",
                              operation: "update",
                              itemId: depId,
                            }
                          );
                      });
                  }
                }

                if (cascadeUpdates.size > 0) {
                  const affectedIds = Array.from(cascadeUpdates.keys());
                  const originalState = affectedIds.map((id) => {
                    const found = currentItems.find((i) => i.id === id);
                    return {
                      id,
                      item: found ? { ...found } : null,
                    };
                  });

                  toast.success(
                    `⚡ Automation: Shifted dates for ${affectedIds.length} dependent task(s)`,
                    {
                      duration: 10000,
                      action: {
                        label: "Revert",
                        onClick: async () => {
                          for (const { id, item } of originalState) {
                            if (!item) continue;
                            dispatch({ type: "UPDATE_ITEM", payload: item });
                            await supabase
                              .from("items")
                              .update({ column_values: item.column_values })
                              .eq("id", id);
                          }
                          toast.info(`↩️ Reverted timeline shift automation.`);
                        },
                      },
                    }
                  );
                }
              }
            }
          }
        }

        const colName =
          activeBoard.columns.find((c) => c.id === columnId)?.title || columnId;
        const oldValue = existingValues[columnId] || "Empty";
        await supabase.from("activity_logs").insert({
          item_id: itemId,
          board_id: activeBoard.id,
          user_id: profile.id,
          action: `Changed "${colName}" from "${oldValue}" to "${newValue}"`,
        });

        if (newlyAssigned.length > 0) {
          const notifications = newlyAssigned.map((userId: string) => ({
            user_id: userId,
            message: `${profile.full_name} assigned you to the task "${itemToUpdate.name}".`,
            board_id: activeBoard.id,
            item_id: itemToUpdate.id,
          }));
          await supabase.from("notifications").insert(notifications);
          
          // Send Telegram alert asynchronously
          fetch('/api/telegram/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userIds: newlyAssigned,
              message: `🔔 *New Assignment*\n${profile.full_name} assigned you to the task *${itemToUpdate.name}*`,
            })
          }).catch(console.error);
        }


        if (
          columnDef &&
          (columnDef.type === "date" ||
            columnDef.type === "timeline" ||
            columnDef.type === "status")
        ) {
          const enrichedBoard = {
            ...activeBoard,
            items: currentItems,
            automations: boardAutomations,
          } as Board & { items: Item[]; automations: Automation[] };
          evaluateTimeAutomations(enrichedBoard, [profile], supabase).catch(
            () => {}
          );
        }

        notifyTabSync(activeBoard.id);
      } catch (err) {
        reportMutationError(err, "Failed to save changes", {
          table: "items",
          operation: "update",
        });
      }
    },
    [dispatch]
  );

  const addItem = useCallback(
    async (
      groupId: string,
      name: string,
      activeBoard: Board,
      currentItems: Item[],
      columnValues: Record<string, any> = {}
    ) => {
      if (!name.trim() || !activeBoard) return;
      const tempId = `temp-${Date.now()}`;
      const groupItems = currentItems.filter((i) => i.group_id === groupId);
      const maxPosition =
        groupItems.length > 0
          ? Math.max(...groupItems.map((i) => i.position))
          : -1;

      const newItem: Item = {
        id: tempId,
        board_id: activeBoard.id,
        group_id: groupId,
        name,
        column_values: columnValues,
        position: maxPosition + 1,
      };
      dispatch({ type: "ADD_ITEM", payload: newItem });
      dispatch({ type: "SET_NEW_ITEM_NAME", payload: "" });
      dispatch({ type: "SET_ADDING_TO_GROUP", payload: null });
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
        if (data) {
          dispatch({
            type: "REPLACE_TEMP_ITEM",
            payload: { tempId, item: data },
          });
          notifyTabSync(newItem.board_id);
        }
      } catch (err) {
        dispatch({ type: "REMOVE_ITEM", payload: tempId });
      }
    },
    [dispatch]
  );

  const duplicateItem = useCallback(
    async (item: Item) => {
      dispatch({ type: "SET_ITEM_MENU_OPEN", payload: null });
      const tempId = `temp-dup-${Date.now()}`;
      const duplicate: Item = {
        ...item,
        id: tempId,
        name: `${item.name} (Copy)`,
        position: item.position + 1,
      };
      dispatch({ type: "ADD_ITEM", payload: duplicate });
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
        if (data)
          dispatch({
            type: "REPLACE_TEMP_ITEM",
            payload: { tempId, item: data },
          });
      } catch {
        dispatch({ type: "REMOVE_ITEM", payload: tempId });
      }
    },
    [dispatch]
  );

  const renameItem = useCallback(
    async (item: Item, newName: string) => {
      dispatch({ type: "SET_ITEM_MENU_OPEN", payload: null });
      if (!newName || newName === item.name) return;

      dispatch({
        type: "UPDATE_ITEM",
        payload: { ...item, name: newName },
      });

      try {
        const { error } = await supabase
          .from("items")
          .update({ name: newName })
          .eq("id", item.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["myWorkItems"] });
      } catch (err) {
        reportMutationError(err, "Failed to rename item", {
          table: "items",
          operation: "update",
        });
        dispatch({ type: "UPDATE_ITEM", payload: item });
      }
    },
    [dispatch, queryClient]
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      const itemToTrash = items.find((i) => i.id === itemId);
      if (itemToTrash) {
        dispatch({ type: "REMOVE_ITEM", payload: itemId });
        dispatch({
          type: "ADD_TRASH_ITEM",
          payload: {
            ...itemToTrash,
            deleted_at: new Date().toISOString(),
          },
        });
      }

      try {
        const { error } = await supabase
          .from("items")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", itemId);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["myWorkItems"] });
        if (itemToTrash) notifyTabSync(itemToTrash.board_id);
      } catch (err) {
        reportMutationError(err, "Failed to delete item", {
          table: "items",
          operation: "update",
        });
        if (itemToTrash) {
          dispatch({ type: "REMOVE_TRASH_ITEM", payload: itemId });
          dispatch({ type: "ADD_ITEM", payload: itemToTrash });
        }
      }
    },
    [dispatch, items, queryClient]
  );

  const restoreItem = useCallback(
    async (itemId: string) => {
      const itemToRestore = trashItems.find((i) => i.id === itemId);
      if (itemToRestore) {
        dispatch({ type: "REMOVE_TRASH_ITEM", payload: itemId });
        dispatch({
          type: "ADD_ITEM",
          payload: { ...itemToRestore, deleted_at: null },
        });
      }

      try {
        const { error } = await supabase
          .from("items")
          .update({ deleted_at: null })
          .eq("id", itemId);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["myWorkItems"] });
      } catch (err) {
        reportMutationError(err, "Failed to restore item", {
          table: "items",
          operation: "update",
        });
        if (itemToRestore) {
          dispatch({ type: "REMOVE_ITEM", payload: itemId });
          dispatch({ type: "ADD_TRASH_ITEM", payload: itemToRestore });
        }
      }
    },
    [dispatch, trashItems]
  );

  const addLink = useCallback(
    async (
      sourceItemId: string,
      targetItemId: string,
      linkType: "dependency" | "relation" | "subitem" = "relation"
    ) => {
      try {
        const tempId = `temp-link-${Date.now()}`;
        const newLink = {
          id: tempId,
          source_item_id: sourceItemId,
          target_item_id: targetItemId,
          link_type: linkType,
          created_at: new Date().toISOString(),
        };
        dispatch({ type: "ADD_ITEM_LINK", payload: newLink });
        const { data, error } = await supabase
          .from("item_links")
          .insert({
            source_item_id: sourceItemId,
            target_item_id: targetItemId,
            link_type: linkType,
          })
          .select()
          .single();
        if (!error && data) {
          dispatch({ type: "REMOVE_ITEM_LINK", payload: tempId });
          dispatch({ type: "ADD_ITEM_LINK", payload: data });
        }
      } catch (err) {
        reportMutationError(err, "Failed to link items", {
          table: "item_links",
          operation: "insert",
        });
      }
    },
    [dispatch]
  );

  const removeLink = useCallback(
    async (linkId: string) => {
      try {
        dispatch({ type: "REMOVE_ITEM_LINK", payload: linkId });
        await supabase.from("item_links").delete().eq("id", linkId);
      } catch (err) {
        reportMutationError(err, "Failed to remove link", {
          table: "item_links",
          operation: "delete",
        });
      }
    },
    [dispatch]
  );

  const handleDragEnd = useCallback(
    async (result: any, activeBoard: Board | null) => {
      const { destination, source, draggableId, type } = result;
      if (!destination) return;
      if (
        destination.droppableId === source.droppableId &&
        destination.index === source.index
      )
        return;

      if (type === "COLUMN" && activeBoard) {
        reorderColumns(activeBoard, source.index, destination.index);
        return;
      }

      const draggedItemIndex = items.findIndex((i) => i.id === draggableId);
      if (draggedItemIndex === -1) return;
      const draggedItem = { ...items[draggedItemIndex] };

      const destGroupItems = items
        .filter(
          (item) =>
            item.group_id === destination.droppableId &&
            item.id !== draggableId
        )
        .sort((a, b) => a.position - b.position);

      destGroupItems.splice(destination.index, 0, draggedItem);

      let newPos = 65536;
      if (destGroupItems.length === 1) {
        newPos = 65536;
      } else if (destination.index === 0) {
        newPos = destGroupItems[1].position / 2;
      } else if (destination.index === destGroupItems.length - 1) {
        newPos = destGroupItems[destination.index - 1].position + 65536;
      } else {
        newPos =
          (destGroupItems[destination.index - 1].position +
            destGroupItems[destination.index + 1].position) /
          2;
      }

      draggedItem.position = newPos;
      draggedItem.group_id = destination.droppableId;

      const finalItems = items.map((item) =>
        item.id === draggableId ? draggedItem : item
      );
      dispatch({ type: "SET_ITEMS", payload: finalItems });

      try {
        await supabase
          .from("items")
          .update({
            group_id: destination.droppableId,
            position: newPos,
          })
          .eq("id", draggableId);
      } catch (err) {
        reportMutationError(err, "Failed to move item", {
          table: "items",
          operation: "update",
        });
      }
    },
    [dispatch, items, reorderColumns]
  );

  return {
    updateCell,
    addItem,
    duplicateItem,
    renameItem,
    deleteItem,
    restoreItem,
    addLink,
    removeLink,
    handleDragEnd,
  };
}
