import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Board, CellValue, DependencyType, Item, ItemLink, Profile, Automation, Column } from "@/types";
import type { BoardStoreDispatch } from "./types";
import { reportMutationError, runWrite } from "@/lib/errorReporting";
import { evaluateEventAutomations } from "@/lib/automations/engine";
import { notifyTabSync } from "@/hooks/useRealtimeSync";
import { toast } from "sonner";
import { addDaysOnly, dayIndex, toDateOnly } from "@/lib/gantt/dates";
import { plotItemDates } from "@/lib/gantt/rows";
import { collectDependencies } from "@/lib/gantt/dependencies";
import { rescheduleFrom } from "@/lib/gantt/reschedule";
import { resolveMoveTargetGroup } from "@/lib/automations/moveTarget";
import { queryKeys } from "@/hooks/queries/queryKeys";


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
  const updateCells = useCallback(
    async (
      currentItems: Item[],
      changes: { itemId: string; columnId: string; value: CellValue }[],
      options: { message?: string } = {}
    ) => {
      if (changes.length === 0) return;

      // Several changes can land on one item, so they are merged before writing.
      //
      // Two maps on purpose. `nextValues` is the whole object, for the optimistic
      // dispatch, which has to render the complete row. `patches` carries ONLY
      // the keys this edit touches, because that is what gets written: sending
      // the whole object meant two people editing different cells on one row
      // each wrote a complete copy built from their own stale snapshot, and the
      // second silently discarded the first one's edit.
      const nextValues = new Map<string, Item["column_values"]>();
      const patches = new Map<string, Record<string, unknown>>();
      const previous = new Map<string, Item>();

      for (const change of changes) {
        const item = currentItems.find((i) => i.id === change.itemId);
        if (!item) continue;
        if (!previous.has(item.id)) previous.set(item.id, { ...item });
        nextValues.set(item.id, {
          ...(nextValues.get(item.id) ?? item.column_values ?? {}),
          [change.columnId]: change.value,
        });
        patches.set(item.id, {
          ...(patches.get(item.id) ?? {}),
          // null, never undefined: undefined disappears when the patch is
          // serialised, which would turn "clear this cell" into a no-op.
          [change.columnId]: change.value === undefined ? null : change.value,
        });
      }

      if (nextValues.size === 0) return;

      for (const [itemId, column_values] of Array.from(nextValues.entries())) {
        dispatch({
          type: "UPDATE_ITEM",
          payload: { ...previous.get(itemId)!, column_values },
        });
      }

      // merge_item_values applies the patch with jsonb `||` inside the database,
      // so a concurrent edit to another cell on the same row survives. It is
      // SECURITY INVOKER, so the caller's row-level security still decides
      // whether the write is allowed, exactly as the UPDATE did.
      const results = await Promise.all(
        Array.from(patches.entries()).map(([itemId, patch]) =>
          supabase
            .rpc("merge_item_values", { p_item_id: itemId, p_patch: patch })
            .then(({ error }) => ({ itemId, error }))
        )
      );

      const failed = results.filter((r) => r.error);
      for (const { itemId, error } of failed) {
        // Put the ones that did not save back where they were, so the screen
        // never shows a date the database does not have.
        const original = previous.get(itemId);
        if (original) dispatch({ type: "UPDATE_ITEM", payload: original });
        reportMutationError(error, "Failed to save the rescheduled dates", {
          table: "items",
          operation: "update",
          itemId,
        });
      }

      if (failed.length > 0) {
        toast.error(
          failed.length === nextValues.size
            ? "Could not save the new dates."
            : `Could not save ${failed.length} of ${nextValues.size} tasks.`
        );
      }

      const saved = Array.from(nextValues.keys()).filter(
        (id) => !failed.some((f) => f.itemId === id)
      );
      if (saved.length === 0) return;

      notifyTabSync(previous.get(saved[0])!.board_id);

      if (options.message) {
        toast.success(options.message, {
          duration: 8000,
          action: {
            label: "Undo",
            onClick: async () => {
              for (const itemId of saved) {
                const original = previous.get(itemId)!;
                dispatch({ type: "UPDATE_ITEM", payload: original });
                await runWrite(
                  supabase
                    .from("items")
                    .update({ column_values: original.column_values })
                    .eq("id", itemId),
                  "Failed to undo the reschedule",
                  { table: "items", operation: "update", itemId }
                );
              }
              notifyTabSync(previous.get(saved[0])!.board_id);
            },
          },
        });
      }
    },
    [dispatch]
  );

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
          // Check the group is really there before writing it.
          //
          // The rule stores an id chosen when it was created. Deleting that
          // group leaves the rule enabled and pointing at nothing, so the next
          // status change wrote a group_id the foreign key refused — and the
          // reader was shown "a required related record could not be found"
          // about an edit they made deliberately, naming a record they never
          // saw. A missing Completed group is re-made, exactly as switching the
          // automation on would have.
          const resolution = await resolveMoveTargetGroup(supabase, {
            boardId: activeBoard.id,
            targetGroupId: eventAutomation.targetGroupId,
            automationId: eventAutomation.matchedRuleId,
          });

          if (resolution.status === "ok") {
            targetGroupId = resolution.groupId;
            if (resolution.healed) {
              // The board list in memory predates the group that was just made,
              // so the row would otherwise move into a group nothing can render.
              queryClient.invalidateQueries({ queryKey: queryKeys.boardData(activeBoard.id) });
              queryClient.invalidateQueries({ queryKey: queryKeys.automations(activeBoard.id) });
            }
            const movedItem = { ...updatedItem, group_id: targetGroupId };
            dispatch({ type: "UPDATE_ITEM", payload: movedItem });
          } else {
            // Better a saved status in the wrong group than a failed edit: the
            // change the person actually made still lands.
            toast.warning(
              "Saved, but this task could not be filed automatically - its Completed group is missing."
            );
          }
        }

        {
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
                    await runWrite(
                      supabase
                        .from("items")
                        .update({
                          group_id: originalGroupId,
                          column_values: originalValues,
                        })
                        .eq("id", itemId),
                      "Failed to revert the automation",
                      { table: "items", operation: "update", itemId }
                    );
                    toast.info(`↩️ Reverted automation on "${itemToUpdate.name}".`);
                  },
                },
              }
            );
          }
        }

        // Checked rather than fire-and-forget: supabase-js resolves with
        // { error } instead of throwing, so a rejected write would otherwise
        // leave the optimistic value on screen until the next refetch replaced
        // it, with no indication anything had gone wrong.
        const { error: cellError } = await supabase
          .from("items")
          .update({
            column_values: updatedValues,
            group_id: targetGroupId,
          })
          .eq("id", itemId);

        if (cellError) {
          dispatch({ type: "UPDATE_ITEM", payload: itemToUpdate });
          throw cellError;
        }

        // --- Dependencies constrain the plan, wherever the date was changed ---
        //
        // This used to be a separate, weaker engine to the Gantt's: it shifted
        // every successor by the same raw delta regardless of link type or lag,
        // only ever forwards, and only on boards carrying an enabled
        // "Timeline & Date Shifting" automation. So the same edit did one thing
        // in the table and another on the chart, and on most boards a
        // dependency constrained nothing at all until you dragged a bar.
        //
        // One engine now, ungated: an arrow means the same thing on every screen.
        const editedItem = { ...itemToUpdate, column_values: updatedValues };
        const plotted = plotItemDates(editedItem, activeBoard);

        // Only the column a task is actually plotted from moves its successors.
        // Editing some other date on the item is not a change to the schedule.
        if (plotted && plotted.columnId === columnId) {
          const tasks = new Map<string, { start: number; end: number }>();
          for (const candidate of currentItems) {
            const at = plotItemDates(candidate, activeBoard);
            if (at) {
              tasks.set(candidate.id, {
                start: dayIndex(at.start),
                end: dayIndex(at.end),
              });
            }
          }

          const dependencies = collectDependencies(
            currentItems,
            new Map([[activeBoard.id, activeBoard]]),
            currentItemLinks
          );

          const { moves, cycleDetected } = rescheduleFrom({
            tasks,
            dependencies,
            movedId: itemId,
            movedTo: { start: dayIndex(plotted.start), end: dayIndex(plotted.end) },
          });

          if (cycleDetected) {
            toast.warning(
              "These tasks depend on each other in a loop, so the plan could not be fully rescheduled."
            );
          }

          // The edited task itself is already written above.
          const changes: { itemId: string; columnId: string; value: CellValue }[] = [];
          for (const [movedId, position] of Array.from(moves.entries())) {
            if (movedId === itemId) continue;
            const target = currentItems.find((i) => i.id === movedId);
            const targetPlot = target && plotItemDates(target, activeBoard);
            if (!target || !targetPlot) continue;

            const start = addDaysOnly(
              targetPlot.start,
              position.start - dayIndex(targetPlot.start)
            );
            const end = addDaysOnly(
              targetPlot.end,
              position.end - dayIndex(targetPlot.end)
            );

            changes.push({
              itemId: movedId,
              columnId: targetPlot.columnId,
              value:
                targetPlot.colType === "date"
                  ? toDateOnly(start)
                  : { start: toDateOnly(start), end: toDateOnly(end) },
            });
          }

          if (changes.length > 0) {
            await updateCells(currentItems, changes, {
              message: `Moved ${changes.length} dependent task${changes.length === 1 ? "" : "s"}`,
            });
          }
        }

        const colName =
          activeBoard.columns?.find((c) => c.id === columnId)?.title || columnId;
        const oldValue = existingValues[columnId] || "Empty";
        // The audit trail is only as good as this write; losing it silently is
        // very likely why activity_logs is close to empty.
        await runWrite(
          supabase.from("activity_logs").insert({
            item_id: itemId,
            board_id: activeBoard.id,
            user_id: profile.id,
            action: `Changed "${colName}" from "${oldValue}" to "${newValue}"`,
          }),
          "Change saved, but it could not be recorded in the activity log",
          { table: "activity_logs", operation: "insert", itemId }
        );

        if (newlyAssigned.length > 0) {
          // Authorised server-side; see notify_users in stage 3.
          await supabase.rpc("notify_users", {
            recipient_ids: newlyAssigned,
            message: `${profile.full_name} assigned you to the task "${itemToUpdate.name}".`,
            board_id: activeBoard.id,
            item_id: itemToUpdate.id,
          });
          
          // Send the Telegram alert.
          //
          // This posted `message` with the sentence written here until now. The
          // route stopped accepting caller-written text — so that it could write
          // each alert in the RECIPIENT's language, and so that a signed-in user
          // could not post arbitrary HTML to someone else's phone — and this
          // call site was not moved over with the two in ItemPanel. It has been
          // answering 400 ever since, in complete silence: a 400 resolves the
          // fetch, so the .catch() below never saw it.
          fetch('/api/telegram/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userIds: newlyAssigned,
              kind: "assignment",
              // Escaped by the route, which is why nothing is escaped here.
              vars: { actor: profile.full_name, item: itemToUpdate.name },
            })
          })
            .then((r) => {
              if (!r.ok) {
                console.error(
                  `[assignment] Telegram alert refused: ${r.status}. ` +
                    `Check the kind is still in the route's allowlist.`
                );
              }
            })
            .catch(console.error);
        }

        // --- Google Calendar Sync ---
        const editedColumn = activeBoard.columns?.find((c) => c.id === columnId);
        const isDateColumn =
          editedColumn?.type === "date" || editedColumn?.type === "timeline";
        if (isPeopleColumn || isDateColumn || columnId === "name") {
          // If we changed people, dates, or the task name, we should sync to GCal for all assignees.
          // Find all assignees in the updated values:
          const peopleColIds = activeBoard.columns.filter(c => c.type === "people").map(c => c.id);
          const allAssignees = new Set<string>();
          peopleColIds.forEach(cId => {
            const val = updatedValues[cId];
            if (Array.isArray(val)) val.forEach(id => allAssignees.add(id));
          });
          
          if (allAssignees.size > 0) {
            // Find the best date to use
            let taskStart: string | undefined;
            let taskEnd: string | undefined;
            
            const timelineCol = activeBoard.columns.find(c => c.type === "timeline");
            const dateCol = activeBoard.columns.find(c => c.type === "date");
            
            if (timelineCol && updatedValues[timelineCol.id]) {
              taskStart = updatedValues[timelineCol.id].start;
              taskEnd = updatedValues[timelineCol.id].end;
            } else if (dateCol && updatedValues[dateCol.id]) {
              taskStart = updatedValues[dateCol.id];
            }

            if (taskStart) {
              fetch('/api/integrations/google/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userIds: Array.from(allAssignees),
                  task: {
                    id: itemId,
                    name: updatedValues.name || itemToUpdate.name,
                    start: taskStart,
                    end: taskEnd,
                    boardName: activeBoard.name,
                  }
                })
})
              .then(async (r) => {
                // A dead Google grant is the one calendar failure the reader
                // can fix, and it used to be invisible: the sync swallowed it,
                // the route reported success, and the settings screen went on
                // saying "Connected" while nothing was written for weeks.
                const body = await r.json().catch(() => null);
                if (body?.reauthRequired > 0) {
                  toast.error(
                    "Google Calendar needs reconnecting - open Profile Settings to sign in again."
                  );
                }
              })
              .catch(console.error);
            }
          }
        }

        // Time-based automations deliberately do NOT run here.
        //
        // They are owned by /api/cron/automations. This client-side call was
        // left behind when they moved server-side, and it evaluated EVERY item
        // on the board on every single cell edit — which is how 74 items were
        // flipped to Overdue in one burst. It also cannot write notifications
        // for other users any more, since that now requires notify_users().
        //
        // Event-driven automations still run from their own call sites.

        notifyTabSync(activeBoard.id);
      } catch (err) {
        reportMutationError(err, "Failed to save changes", {
          table: "items",
          operation: "update",
        });
      }
    },
    [dispatch, updateCells]
  );

  /**
   * Write several cells as one change.
   *
   * This is how the Gantt applies a reschedule: dragging a task moves it and
   * everything downstream of it, and that has to land as a single thing the
   * user can undo — not as one toast per task, and not as a half-applied plan
   * if the fourth write fails.
   *
   * It deliberately runs no dependency cascade of its own. The caller has
   * already worked out every task that moves, honouring link types and lag; a
   * second pass here would shift the same successors twice.
   */
  /**
   * Freeze the current dates as the agreed plan.
   *
   * A Gantt drawn only from today's dates always looks on time, because the
   * slippage is exactly what has been edited away. Storing what was agreed is
   * the only way the chart can show drift from it.
   */
  const captureBaseline = useCallback(
    async (
      currentItems: Item[],
      baselines: { itemId: string; start: string; end: string }[]
    ) => {
      if (baselines.length === 0) return;

      const capturedAt = new Date().toISOString();
      const previous = new Map<string, Item>();

      for (const { itemId } of baselines) {
        const item = currentItems.find((i) => i.id === itemId);
        if (item) previous.set(itemId, { ...item });
      }

      const applicable = baselines.filter((b) => previous.has(b.itemId));
      if (applicable.length === 0) return;

      for (const { itemId, start, end } of applicable) {
        dispatch({
          type: "UPDATE_ITEM",
          payload: {
            ...previous.get(itemId)!,
            baseline: { start, end, captured_at: capturedAt },
          },
        });
      }

      const results = await Promise.all(
        applicable.map(({ itemId, start, end }) =>
          supabase
            .from("items")
            .update({ baseline: { start, end, captured_at: capturedAt } })
            .eq("id", itemId)
            .then(({ error }) => ({ itemId, error }))
        )
      );

      const failed = results.filter((r) => r.error);
      for (const { itemId, error } of failed) {
        dispatch({ type: "UPDATE_ITEM", payload: previous.get(itemId)! });
        reportMutationError(error, "Failed to save the baseline", {
          table: "items",
          operation: "update",
          itemId,
        });
      }

      if (failed.length === applicable.length) {
        toast.error("Could not save the baseline.");
        return;
      }

      const saved = applicable.length - failed.length;
      notifyTabSync(previous.get(applicable[0].itemId)!.board_id);
      toast.success(`Baseline set for ${saved} task${saved === 1 ? "" : "s"}`, {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: async () => {
            for (const { itemId } of applicable) {
              const original = previous.get(itemId)!;
              dispatch({ type: "UPDATE_ITEM", payload: original });
              await runWrite(
                supabase
                  .from("items")
                  .update({ baseline: original.baseline ?? null })
                  .eq("id", itemId),
                "Failed to undo the baseline",
                { table: "items", operation: "update", itemId }
              );
            }
            notifyTabSync(previous.get(applicable[0].itemId)!.board_id);
          },
        },
      });
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
        if (data) {
          dispatch({
            type: "REPLACE_TEMP_ITEM",
            payload: { tempId, item: data },
          });
          notifyTabSync(data.board_id);
        }
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
        notifyTabSync(item.board_id);

        // Google Calendar Sync on Rename
        if (item.column_values) {
          const { data: board } = await supabase
            .from('boards')
            .select('title, columns')
            .eq('id', item.board_id)
            .single();
            
          if (board && board.columns) {
            const peopleColIds = (board.columns as Column[]).filter((c) => c.type === "people").map((c) => c.id);
            const allAssignees = new Set<string>();
            peopleColIds.forEach((cId) => {
              const val = item.column_values[cId];
              if (Array.isArray(val)) val.forEach((id: string) => allAssignees.add(id));
            });
            
            if (allAssignees.size > 0) {
              let taskStart: string | undefined;
              let taskEnd: string | undefined;
              
              const timelineCol = (board.columns as Column[]).find((c) => c.type === "timeline");
              const dateCol = (board.columns as Column[]).find((c) => c.type === "date");
              
              if (timelineCol && item.column_values[timelineCol.id]) {
                taskStart = item.column_values[timelineCol.id].start;
                taskEnd = item.column_values[timelineCol.id].end;
              } else if (dateCol && item.column_values[dateCol.id]) {
                taskStart = item.column_values[dateCol.id];
              }

              if (taskStart) {
                fetch('/api/integrations/google/sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userIds: Array.from(allAssignees),
                    task: {
                      id: item.id,
                      name: newName,
                      start: taskStart,
                      end: taskEnd,
                      boardName: board.title,
                    }
                  })
})
                .then(async (r) => {
                  // A dead Google grant is the one calendar failure the reader
                  // can fix, and it used to be invisible: the sync swallowed it,
                  // the route reported success, and the settings screen went on
                  // saying "Connected" while nothing was written for weeks.
                  const body = await r.json().catch(() => null);
                  if (body?.reauthRequired > 0) {
                    toast.error(
                      "Google Calendar needs reconnecting - open Profile Settings to sign in again."
                    );
                  }
                })
                .catch(console.error);
              }
            }
          }
        }
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

      // Best-effort, and deliberately before the soft-delete write below: the
      // route re-reads the item's column_values through RLS to find who it
      // was synced to, which only works while the item is still live. A
      // failure here must not block the delete itself - it just means a
      // calendar event lingers until it's cleaned up by hand.
      fetch('/api/integrations/google/delete-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: itemId }),
      }).catch((err) => console.error('[Google Calendar] delete-task cleanup failed:', err));

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
        if (itemToRestore) notifyTabSync(itemToRestore.board_id);
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

  const permanentlyDeleteItem = useCallback(
    async (itemId: string) => {
      const itemToDelete = trashItems.find((i) => i.id === itemId);
      dispatch({ type: "REMOVE_TRASH_ITEM", payload: itemId });
      try {
        const { error } = await supabase
          .from("items")
          .delete()
          .eq("id", itemId);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["myWorkItems"] });
        if (itemToDelete) notifyTabSync(itemToDelete.board_id);
        toast.success("Item permanently deleted");
      } catch (err) {
        reportMutationError(err, "Failed to permanently delete item", {
          table: "items",
          operation: "delete",
        });
        toast.error("Failed to permanently delete item");
      }
    },
    [dispatch, queryClient, trashItems]
  );

  const addLink = useCallback(
    async (
      sourceItemId: string,
      targetItemId: string,
      linkType: "dependency" | "relation" | "subitem" = "relation",
      // Only meaningful for dependencies. Defaulted so every existing caller
      // keeps making the plain finish-to-start links it always made.
      options: { depType?: DependencyType; lagDays?: number } = {}
    ) => {
      try {
        const depType = options.depType ?? "FS";
        const lagDays = options.lagDays ?? 0;
        const tempId = `temp-link-${Date.now()}`;
        const newLink = {
          id: tempId,
          source_item_id: sourceItemId,
          target_item_id: targetItemId,
          link_type: linkType,
          dep_type: depType,
          lag_days: lagDays,
          created_at: new Date().toISOString(),
        };
        dispatch({ type: "ADD_ITEM_LINK", payload: newLink });
        const { data, error } = await supabase
          .from("item_links")
          .insert({
            source_item_id: sourceItemId,
            target_item_id: targetItemId,
            link_type: linkType,
            dep_type: depType,
            lag_days: lagDays,
          })
          .select()
          .single();
        if (!error && data) {
          dispatch({ type: "REMOVE_ITEM_LINK", payload: tempId });
          dispatch({ type: "ADD_ITEM_LINK", payload: data });
          const boardId = items.find((i) => i.id === sourceItemId)?.board_id;
          if (boardId) notifyTabSync(boardId);
        } else if (error) {
          // Take the optimistic link back off the chart: leaving it there shows
          // an arrow the database does not have.
          dispatch({ type: "REMOVE_ITEM_LINK", payload: tempId });
          reportMutationError(error, "Failed to link items", {
            table: "item_links",
            operation: "insert",
          });
          toast.error("Could not link those tasks.");
        }
      } catch (err) {
        reportMutationError(err, "Failed to link items", {
          table: "item_links",
          operation: "insert",
        });
      }
    },
    [dispatch, items]
  );

  /** Change an existing dependency's type or lag. */
  const updateLink = useCallback(
    async (
      currentItemLinks: ItemLink[],
      linkId: string,
      changes: { depType?: DependencyType; lagDays?: number }
    ) => {
      const existing = currentItemLinks.find((l) => l.id === linkId);
      if (!existing) return;

      const updated: ItemLink = {
        ...existing,
        dep_type: changes.depType ?? existing.dep_type ?? "FS",
        lag_days: changes.lagDays ?? existing.lag_days ?? 0,
      };

      dispatch({ type: "REMOVE_ITEM_LINK", payload: linkId });
      dispatch({ type: "ADD_ITEM_LINK", payload: updated });

      const { error } = await supabase
        .from("item_links")
        .update({ dep_type: updated.dep_type, lag_days: updated.lag_days })
        .eq("id", linkId);

      if (error) {
        dispatch({ type: "REMOVE_ITEM_LINK", payload: linkId });
        dispatch({ type: "ADD_ITEM_LINK", payload: existing });
        reportMutationError(error, "Failed to change the dependency", {
          table: "item_links",
          operation: "update",
        });
        toast.error("Could not change that dependency.");
      } else {
        const boardId = items.find((i) => i.id === existing.source_item_id)?.board_id;
        if (boardId) notifyTabSync(boardId);
      }
    },
    [dispatch, items]
  );

  const removeLink = useCallback(
    async (linkId: string) => {
      try {
        const link = itemLinks.find((l) => l.id === linkId);
        dispatch({ type: "REMOVE_ITEM_LINK", payload: linkId });
        const ok = await runWrite(
          supabase.from("item_links").delete().eq("id", linkId),
          "Failed to remove link",
          { table: "item_links", operation: "delete" }
        );
        if (ok && link) {
          const boardId = items.find((i) => i.id === link.source_item_id)?.board_id;
          if (boardId) notifyTabSync(boardId);
        }
      } catch (err) {
        reportMutationError(err, "Failed to remove link", {
          table: "item_links",
          operation: "delete",
        });
      }
    },
    [dispatch, items, itemLinks]
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

      // items.position is an INTEGER column. Halving the gap produced values
      // like 4.5, which Postgres rejects with 22P02
      // (invalid input syntax for type integer), so the move silently failed
      // whenever the item landed at the top of a group or between two adjacent
      // rows. Landing at the end happened to work because prev + SPACING is
      // whole, which is why this looked intermittent.
      const SPACING = 65536;
      const prevPos =
        destination.index > 0 ? destGroupItems[destination.index - 1].position : null;
      const nextPos =
        destination.index < destGroupItems.length - 1
          ? destGroupItems[destination.index + 1].position
          : null;

      let newPos: number;
      if (prevPos === null && nextPos === null) {
        newPos = SPACING;
      } else if (prevPos === null) {
        newPos = Math.floor(nextPos! / 2);
      } else if (nextPos === null) {
        newPos = prevPos + SPACING;
      } else {
        newPos = Math.floor((prevPos + nextPos) / 2);
      }

      // Flooring can still land on a neighbour once the gap closes to 1, which
      // would make the order ambiguous. Renumber the destination group instead.
      const collides =
        (prevPos !== null && newPos <= prevPos) ||
        (nextPos !== null && newPos >= nextPos);

      // Nothing here writes to an existing item object.
      //
      // destGroupItems holds the same references as `items`, and `items` is what
      // the catch below dispatches to undo a failed move. Renumbering siblings in
      // place therefore edited the very array the rollback restores, so their
      // positions were never put back - and because the references had not
      // changed, memoised rows could keep the stale ones on screen. The new
      // positions travel as plain data and are applied to copies below.
      const renumbered: { id: string; position: number }[] = [];
      if (collides) {
        destGroupItems.forEach((it, idx) => {
          renumbered.push({ id: it.id, position: (idx + 1) * SPACING });
        });
        newPos = draggedItem.position;
      }

      const movedItem = {
        ...draggedItem,
        position: newPos,
        group_id: destination.droppableId,
      };

      const renumberedById = new Map(renumbered.map((r) => [r.id, r.position]));
      const finalItems = items.map((item) => {
        if (item.id === draggableId) return movedItem;
        const pos = renumberedById.get(item.id);
        return pos === undefined ? item : { ...item, position: pos };
      });
      dispatch({ type: "SET_ITEMS", payload: finalItems });

      try {
        // supabase-js resolves with { error } instead of throwing, so a rejected
        // write — an RLS denial, a constraint, a dropped connection — used to be
        // swallowed here. The item stayed put on screen until the next refetch
        // snapped it back, with nothing explaining why.
        const { error, data } = await supabase
          .from("items")
          .update({
            group_id: destination.droppableId,
            position: newPos,
          })
          .eq("id", draggableId)
          .select("id");

        if (error) throw error;

        // A permitted-but-matched-nothing update also means the move did not
        // happen; treat it as a failure rather than reporting success. Kept
        // distinct from the error branch so the two causes are never confused.
        if (!data || data.length === 0) {
          throw new Error(
            `Move not saved: no row matched id ${draggableId}. ` +
              `Target group ${destination.droppableId}, position ${newPos}. ` +
              `This usually means row-level security rejected the update.`
          );
        }

        // Persist any siblings that had to be renumbered to make room
        const siblings = renumbered.filter((r) => r.id !== draggableId);
        if (siblings.length > 0) {
          const results = await Promise.all(
            siblings.map((r) =>
              supabase.from("items").update({ position: r.position }).eq("id", r.id)
            )
          );
          const failed = results.find((r) => r.error);
          if (failed?.error) throw failed.error;
        }

        notifyTabSync(movedItem.board_id);
      } catch (err) {
        // Put the item back where it came from, so the board never shows a
        // position that is not in the database.
        dispatch({ type: "SET_ITEMS", payload: items });
        reportMutationError(err, "Failed to move item", {
          table: "items",
          operation: "update",
          context: `id=${draggableId} -> group=${destination.droppableId}, position=${newPos}`,
        });
      }
    },
    [dispatch, items, reorderColumns]
  );

  return {
    updateCell,
    updateCells,
    captureBaseline,
    addItem,
    duplicateItem,
    renameItem,
    deleteItem,
    restoreItem,
    permanentlyDeleteItem,
    addLink,
    updateLink,
    removeLink,
    handleDragEnd,
  };
}
