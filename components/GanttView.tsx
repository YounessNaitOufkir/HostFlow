"use client";

import React, { useMemo } from "react";
import { Board, CellValue, DependencyType, GanttConfig, Item, Group, ItemLink, Profile } from "@/types";
import GanttChart from "@/components/gantt/GanttChart";
import { useT } from "@/components/LanguageProvider";
import { candidateDateColumns } from "@/lib/gantt/config";
import type { GanttBoardContext } from "@/lib/gantt/rows";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { useAuth } from "@/components/AuthProvider";
import { useDelayNotes } from "@/hooks/useDelayNotes";
import type { GanttDelays } from "@/components/gantt/GanttChart";

interface GanttViewProps {
  board: Board | null;
  items: Item[];
  /**
   * Every item on the board, when `items` has been through the board's
   * filters. The critical path is computed over these, so a filter never
   * changes what is critical.
   */
  allItems?: Item[];
  groups: Group[];
  itemLinks?: ItemLink[];
  onUpdateItem?: (itemId: string, columnId: string, value: CellValue) => void;
  onRescheduleItems?: (
    changes: { itemId: string; columnId: string; value: CellValue }[],
    summary: { movedCount: number; cycleDetected: boolean }
  ) => void;
  onCaptureBaseline?: (
    baselines: { itemId: string; start: string; end: string }[]
  ) => void;
  onCreateLink?: (link: {
    sourceId: string;
    targetId: string;
    type: DependencyType;
  }) => void;
  onUpdateLink?: (
    linkId: string,
    changes: { type?: DependencyType; lag?: number }
  ) => void;
  onDeleteLink?: (linkId: string) => void;
  /** Renames a task, from a double-click on its name in the task list. */
  onRenameItem?: (item: Item, name: string) => Promise<void> | void;
  onMoveItem?: (sourceId: string, targetId: string) => void;
  collapsedGroups?: string[];
  onToggleGroupCollapse?: (groupId: string) => void;
  onSelectItem?: (item: Item) => void;
  profiles?: Profile[];
  /** Saves a change to the board's Gantt settings: target finish, work week. */
  onUpdateGanttConfig?: (patch: Partial<GanttConfig>) => Promise<boolean> | void;
}

/**
 * One board's Gantt.
 *
 * The chart itself lives in `components/gantt` and is shared with the Master
 * Gantt, so both surfaces get the same zoom, geometry and interactions rather
 * than one being a degraded copy of the other. This wrapper only says what a
 * single board's slice of that chart is.
 */
export default function GanttView({
  board,
  items,
  allItems,
  groups,
  itemLinks = [],
  onUpdateItem,
  onRescheduleItems,
  onCaptureBaseline,
  onCreateLink,
  onUpdateLink,
  onDeleteLink,
  onRenameItem,
  onMoveItem,
  collapsedGroups,
  onToggleGroupCollapse,
  onSelectItem,
  profiles,
  onUpdateGanttConfig,
}: GanttViewProps) {
  const t = useT();
  const { profile } = useAuth();
  const contexts = useMemo<GanttBoardContext[]>(
    () => (board ? [{ board, groups, items }] : []),
    [board, groups, items]
  );
  // Why tasks ran late: read by anyone on the board, written by anyone who
  // can edit it - the same people who can move its dates.
  const delayApi = useDelayNotes(board ? [board.id] : []);
  const delays = useMemo<GanttDelays>(
    () => ({
      byItem: delayApi.byItem,
      currentUserId: profile?.id,
      onAdd: onUpdateItem
        ? (item, values) => delayApi.add({ itemId: item.id, boardId: item.board_id, ...values })
        : undefined,
      onUpdate: onUpdateItem ? delayApi.update : undefined,
      onRemove: onUpdateItem ? delayApi.remove : undefined,
    }),
    [delayApi, profile?.id, onUpdateItem]
  );

  const planContexts = useMemo<GanttBoardContext[] | undefined>(
    () => (board && allItems ? [{ board, groups, items: allItems }] : undefined),
    [board, groups, allItems]
  );

  // Asked of the database rather than mirrored here: changing a board's
  // settings is gated by can_manage_board(), and a picker offered to someone
  // it refuses would save nothing. Until it answers, no picker.
  const { data: canManageBoard = false } = useQuery({
    queryKey: queryKeys.canManageBoard(board?.id ?? "", profile?.id ?? ""),
    enabled: Boolean(board?.id && profile?.id && onUpdateGanttConfig),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_manage_board", { b_id: board!.id });
      if (error) return false;
      return data === true;
    },
  });

  const collapsed = useMemo(
    () => new Set(collapsedGroups ?? []),
    [collapsedGroups]
  );

  if (!board) return null;

  // Without somewhere to read dates from there is no chart to draw, and saying
  // so is more useful than an empty grid.
  if (candidateDateColumns(board).length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-8">
        <div className="text-center bg-white dark:bg-slate-900 p-8 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            {t("gantt.needsDatesTitle")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            {t("gantt.needsDatesBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <GanttChart
      contexts={contexts}
      planContexts={planContexts}
      delays={delays}
      onUpdateGanttConfig={canManageBoard ? onUpdateGanttConfig : undefined}
      itemLinks={itemLinks}
      profiles={profiles}
      collapsed={collapsed}
      onToggleCollapse={(id) => onToggleGroupCollapse?.(id)}
      onUpdateItem={onUpdateItem}
      onRescheduleItems={onRescheduleItems}
      onCaptureBaseline={onCaptureBaseline}
      onCreateLink={onCreateLink}
      onUpdateLink={onUpdateLink}
      onDeleteLink={onDeleteLink}
      onRenameItem={onRenameItem}
      onMoveItem={onMoveItem}
      onSelectItem={onSelectItem}
      storageKey={`board-${board.id}`}
      exportTitle={board.name}
      emptyMessage={
        <>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            {t("gantt.noDatedTitle")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            {t("gantt.noDatedBody")}
          </p>
        </>
      }
    />
  );
}
