"use client";

import React, { useMemo } from "react";
import { Board, CellValue, DependencyType, Item, Group, ItemLink, Profile } from "@/types";
import GanttChart from "@/components/gantt/GanttChart";
import { candidateDateColumns } from "@/lib/gantt/config";
import type { GanttBoardContext } from "@/lib/gantt/rows";

interface GanttViewProps {
  board: Board | null;
  items: Item[];
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
  onMoveItem?: (sourceId: string, targetId: string) => void;
  collapsedGroups?: string[];
  onToggleGroupCollapse?: (groupId: string) => void;
  onSelectItem?: (item: Item) => void;
  profiles?: Profile[];
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
  groups,
  itemLinks = [],
  onUpdateItem,
  onRescheduleItems,
  onCaptureBaseline,
  onCreateLink,
  onUpdateLink,
  onDeleteLink,
  onMoveItem,
  collapsedGroups,
  onToggleGroupCollapse,
  onSelectItem,
  profiles,
}: GanttViewProps) {
  const contexts = useMemo<GanttBoardContext[]>(
    () => (board ? [{ board, groups, items }] : []),
    [board, groups, items]
  );

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
            Gantt Chart Needs Dates
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Add a <strong>Timeline</strong> or <strong>Date</strong> column to your board
            to use the Gantt chart.
          </p>
        </div>
      </div>
    );
  }

  return (
    <GanttChart
      contexts={contexts}
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
      onMoveItem={onMoveItem}
      onSelectItem={onSelectItem}
      storageKey={`board-${board.id}`}
      exportTitle={board.name}
      emptyMessage={
        <>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            No dated items yet
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Fill in the <strong>Timeline</strong> or <strong>Date</strong> column on an
            item and it will appear on the chart.
          </p>
        </>
      }
    />
  );
}
