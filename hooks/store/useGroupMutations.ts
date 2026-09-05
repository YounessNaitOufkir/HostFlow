import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Board, Group, Item } from "@/types";
import type { BoardStoreDispatch } from "./types";
import { reportMutationError, runWrite } from "@/lib/errorReporting";

interface UseGroupMutationsProps {
  dispatch: BoardStoreDispatch;
  groups: Group[];
  items: Item[];
}

export function useGroupMutations({
  dispatch,
  groups,
  items,
}: UseGroupMutationsProps) {
  const renameGroup = useCallback(
    async (groupId: string, title: string) => {
      if (!title.trim()) {
        dispatch({
          type: "SET_EDITING_GROUP",
          payload: { id: null, title: "" },
        });
        return;
      }
      dispatch({
        type: "SET_GROUPS",
        payload: groups.map((g) => (g.id === groupId ? { ...g, title } : g)),
      });
      dispatch({ type: "SET_EDITING_GROUP", payload: { id: null, title: "" } });
      await runWrite(
        supabase.from("groups").update({ title }).eq("id", groupId),
        "Failed to rename group", {
          table: "groups",
          operation: "update",
        }
      );
    },
    [dispatch, groups]
  );

  const changeGroupColor = useCallback(
    async (groupId: string, color: string) => {
      dispatch({
        type: "SET_GROUPS",
        payload: groups.map((g) => (g.id === groupId ? { ...g, color } : g)),
      });
      await runWrite(
        supabase.from("groups").update({ color }).eq("id", groupId),
        "Failed to update group color", {
          table: "groups",
          operation: "update",
        }
      );
    },
    [dispatch, groups]
  );

  const addGroup = useCallback(
    async (activeBoard: Board, boardGroups: Group[]) => {
      if (!activeBoard) return;
      const colors = [
        "#579bfc",
        "#00c875",
        "#e2445c",
        "#fdab3d",
        "#a25ddc",
        "#0086c0",
      ];
      const tempId = `temp-group-${Date.now()}`;
      const newGroup: Group = {
        id: tempId,
        title: "New Group",
        color: colors[Math.floor(Math.random() * colors.length)],
        position: boardGroups.length,
        board_id: activeBoard.id,
      };
      dispatch({ type: "ADD_GROUP", payload: newGroup });
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
        if (data)
          dispatch({
            type: "REPLACE_TEMP_GROUP",
            payload: { tempId, group: data },
          });
      } catch {
        dispatch({ type: "REMOVE_GROUP", payload: tempId });
      }
    },
    [dispatch]
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      if (!window.confirm("Are you sure you want to delete this group?"))
        return;

      const groupToDelete = groups.find((g) => g.id === groupId);
      const itemsToDelete = items.filter((i) => i.group_id === groupId);

      dispatch({ type: "REMOVE_GROUP", payload: groupId });
      try {
        const { error: itemsError } = await supabase
          .from("items")
          .delete()
          .eq("group_id", groupId);
        if (itemsError) throw itemsError;

        const { error: groupError } = await supabase
          .from("groups")
          .delete()
          .eq("id", groupId);
        if (groupError) throw groupError;
      } catch (err) {
        reportMutationError(err, "Failed to delete group", {
          table: "groups",
          operation: "delete",
        });
        // Revert optimism.
        //
        // `groups` and `items` are the arrays captured at render, so they still
        // hold the rows this tried to delete - finding groupToDelete in `groups`
        // above depends on exactly that. Appending them back therefore added the
        // group a second time and every one of its items a second time, leaving
        // a failed delete showing doubled rows under duplicate React keys.
        // Restoring the captured arrays as they are is the whole revert.
        if (groupToDelete) {
          dispatch({ type: "SET_GROUPS", payload: groups });
        }
        if (itemsToDelete.length > 0) {
          dispatch({ type: "SET_ITEMS", payload: items });
        }
      }
    },
    [dispatch, groups, items]
  );

  const toggleGroupCollapse = useCallback(
    (groupId: string) => {
      dispatch({ type: "TOGGLE_GROUP_COLLAPSE", payload: groupId });
    },
    [dispatch]
  );

  const reorderGroups = useCallback(
    async (boardGroups: Group[], startIndex: number, endIndex: number) => {
      if (startIndex === endIndex) return;
      const sorted = [...boardGroups].sort((a, b) => a.position - b.position);
      const [moved] = sorted.splice(startIndex, 1);
      sorted.splice(endIndex, 0, moved);
      const updated = sorted.map((g, idx) => ({ ...g, position: idx }));
      dispatch({ type: "SET_GROUPS", payload: updated });
      try {
        await Promise.all(
          updated.map((g) =>
            supabase.from("groups").update({ position: g.position }).eq("id", g.id)
          )
        );
      } catch (err) {
        reportMutationError(err, "Failed to reorder groups", {
          table: "groups",
          operation: "update",
        });
      }
    },
    [dispatch]
  );

  const moveGroup = useCallback(
    async (groupId: string, direction: "up" | "down") => {
      const sorted = [...groups].sort((a, b) => a.position - b.position);
      const currentIndex = sorted.findIndex((g) => g.id === groupId);
      if (currentIndex === -1) return;
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= sorted.length) return;
      reorderGroups(sorted, currentIndex, targetIndex);
    },
    [groups, reorderGroups]
  );

  return {
    renameGroup,
    changeGroupColor,
    addGroup,
    deleteGroup,
    toggleGroupCollapse,
    reorderGroups,
    moveGroup,
  };
}
