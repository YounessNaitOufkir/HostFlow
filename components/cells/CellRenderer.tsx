"use client";

import React from "react";
import { Item, Column, Profile } from "@/types";
import StatusCell from "./StatusCell";
import TextCell from "./TextCell";
import DateCell from "./DateCell";
import NumberCell from "./NumberCell";
import PeopleCell from "./PeopleCell";
import TimelineCell from "./TimelineCell";
import TagsCell from "./TagsCell";
import PriorityCell from "./PriorityCell";
import FilesCell from "./FilesCell";
import DependencyCell from "./DependencyCell";
import FormulaCell from "./FormulaCell";

interface CellRendererProps {
  item: Item;
  column: Column;
  activeStatusId: string | null;
  setActiveStatusId: (id: string | null) => void;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  profiles?: Profile[];
  boardItems?: Item[];
  allItems?: Item[];
}

/**
 * Dispatcher component that routes to the correct cell based on column type.
 * This is the single entry point used by item rows to render dynamic cells.
 */
export default function CellRenderer({
  item,
  column,
  activeStatusId,
  setActiveStatusId,
  onUpdate,
  profiles,
  boardItems,
  allItems,
}: CellRendererProps) {
  switch (column.type) {
    case "status":
      return (
        <StatusCell
          item={item}
          column={column}
          activeStatusId={activeStatusId}
          setActiveStatusId={setActiveStatusId}
          onUpdate={onUpdate}
        />
      );
    case "text":
      return <TextCell item={item} column={column} onUpdate={onUpdate} />;
    case "date":
      return <DateCell item={item} column={column} onUpdate={onUpdate} />;
    case "numbers":
      return <NumberCell item={item} column={column} onUpdate={onUpdate} />;
    case "people":
      return <PeopleCell item={item} column={column} onUpdate={onUpdate} profiles={profiles || []} />;
    case "timeline":
      return <TimelineCell item={item} column={column} onUpdate={onUpdate} />;
    case "tags":
      return <TagsCell item={item} column={column} onUpdate={onUpdate} />;
    case "priority":
      return <PriorityCell item={item} column={column} onUpdate={onUpdate} />;
    case "files":
      return <FilesCell item={item} column={column} onUpdate={onUpdate} />;
    case "dependency":
      return <DependencyCell item={item} column={column} onUpdate={onUpdate} boardItems={boardItems || []} />;
    case "formula":
      return <FormulaCell item={item} column={column} onUpdate={onUpdate} allItems={allItems} />;
    default:
      return <div className="w-32 border-r border-gray-200 dark:border-slate-700 shrink-0 bg-gray-50 dark:bg-slate-800"></div>;
  }
}
