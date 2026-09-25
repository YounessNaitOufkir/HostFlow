import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Board, Column, ColumnType } from "@/types";
import type { BoardStoreDispatch } from "./types";
import { getDefaultTitle } from "@/lib/columnRegistry";
import { runWrite } from "@/lib/errorReporting";
import { notifyTabSyncBoards } from "@/hooks/useRealtimeSync";

interface UseColumnMutationsProps {
  dispatch: BoardStoreDispatch;
}

export function useColumnMutations({ dispatch }: UseColumnMutationsProps) {
  const addColumn = useCallback(
    async (activeBoard: Board, type: ColumnType, preset?: Pick<Column, "title" | "settings">) => {
      dispatch({ type: "SET_SHOW_ADD_COLUMN_MENU", payload: null });
      const newColId = `${type}_${Date.now()}`;
      const newColTitle = preset?.title ?? getDefaultTitle(type);
      const currentColumns = activeBoard.columns || [];
      const newColumn: Column = {
        id: newColId,
        title: newColTitle,
        type,
        ...(preset?.settings ? { settings: preset.settings } : {}),
      };
      const updatedColumns = [...currentColumns, newColumn];
      const updatedBoard = { ...activeBoard, columns: updatedColumns };
      dispatch({ type: "UPDATE_BOARD", payload: updatedBoard });
      const ok = await runWrite(
        supabase
          .from("boards")
          .update({ columns: updatedColumns })
          .eq("id", activeBoard.id),
        "Failed to add column", {
          table: "boards",
          operation: "update",
        }
      );
      if (ok) notifyTabSyncBoards();
    },
    [dispatch]
  );

  const renameColumn = useCallback(
    async (activeBoard: Board, columnId: string, newTitle: string) => {
      const updatedColumns = (activeBoard.columns || []).map((col) =>
        col.id === columnId ? { ...col, title: newTitle } : col
      );
      dispatch({
        type: "UPDATE_BOARD",
        payload: { ...activeBoard, columns: updatedColumns },
      });
      const ok = await runWrite(
        supabase
          .from("boards")
          .update({ columns: updatedColumns })
          .eq("id", activeBoard.id),
        "Failed to rename column", {
          table: "boards",
          operation: "update",
        }
      );
      if (ok) notifyTabSyncBoards();
    },
    [dispatch]
  );

  const resizeColumn = useCallback(
    async (activeBoard: Board, columnId: string, width: number) => {
      const updatedColumns = (activeBoard.columns || []).map((col) =>
        col.id === columnId ? { ...col, width } : col
      );
      dispatch({
        type: "UPDATE_BOARD",
        payload: { ...activeBoard, columns: updatedColumns },
      });
      const ok = await runWrite(
        supabase
          .from("boards")
          .update({ columns: updatedColumns })
          .eq("id", activeBoard.id),
        "Failed to resize column", {
          table: "boards",
          operation: "update",
        }
      );
      if (ok) notifyTabSyncBoards();
    },
    [dispatch]
  );

  const deleteColumn = useCallback(
    async (activeBoard: Board, columnId: string) => {
      if (!window.confirm("Are you sure you want to delete this column?"))
        return;
      const updatedColumns = (activeBoard.columns || []).filter(
        (col) => col.id !== columnId
      );
      dispatch({
        type: "UPDATE_BOARD",
        payload: { ...activeBoard, columns: updatedColumns },
      });
      const ok = await runWrite(
        supabase
          .from("boards")
          .update({ columns: updatedColumns })
          .eq("id", activeBoard.id),
        "Failed to delete column", {
          table: "boards",
          operation: "update",
        }
      );
      if (ok) notifyTabSyncBoards();
    },
    [dispatch]
  );

  const reorderColumns = useCallback(
    async (activeBoard: Board, startIndex: number, endIndex: number) => {
      const cols = [...(activeBoard.columns || [])];
      const [moved] = cols.splice(startIndex, 1);
      cols.splice(endIndex, 0, moved);
      dispatch({
        type: "UPDATE_BOARD",
        payload: { ...activeBoard, columns: cols },
      });
      const ok = await runWrite(
        supabase
          .from("boards")
          .update({ columns: cols })
          .eq("id", activeBoard.id),
        "Failed to reorder columns", {
          table: "boards",
          operation: "update",
        }
      );
      if (ok) notifyTabSyncBoards();
    },
    [dispatch]
  );

  const toggleColumnVisibility = useCallback(
    (boardId: string, columnId: string) => {
      dispatch({
        type: "TOGGLE_COLUMN_VISIBILITY",
        payload: { boardId, columnId },
      });
    },
    [dispatch]
  );

  return {
    addColumn,
    renameColumn,
    resizeColumn,
    deleteColumn,
    reorderColumns,
    toggleColumnVisibility,
  };
}
