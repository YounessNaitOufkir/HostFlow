"use client";

import React from "react";
import { Item, Column, Profile } from "@/types";
import { getColumnWidth } from "@/lib/columnRegistry";
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
import CheckboxCell from "./CheckboxCell";
import LinkCell from "./LinkCell";
import RatingCell from "./RatingCell";
import RelationCell from "./RelationCell";
import ButtonCell from "./ButtonCell";

interface CellRendererProps {
  item: Item;
  column: Column;
  activeStatusId: string | null;
  setActiveStatusId: (id: string | null) => void;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
  profiles?: Profile[];
  boardItems?: Item[];
  /** All column definitions on the board (needed by FormulaCell) */
  columns?: Column[];
}

/**
 * Dispatcher component that routes to the correct cell based on column type.
 * Uses the column registry for width classes and delegates rendering to
 * specialized cell components.
 */
export default function CellRenderer({
  item,
  column,
  activeStatusId,
  setActiveStatusId,
  onUpdate,
  profiles,
  boardItems,
  columns,
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
      return (
        <PeopleCell 
          item={item} 
          column={column} 
          onUpdate={onUpdate} 
          profiles={profiles || []}
          activeStatusId={activeStatusId}
          setActiveStatusId={setActiveStatusId}
        />
      );
    case "timeline":
      return (
        <TimelineCell
          item={item}
          column={column}
          onUpdate={onUpdate}
          activeStatusId={activeStatusId}
          setActiveStatusId={setActiveStatusId}
          columns={columns}
        />
      );
    case "tags":
      return (
        <TagsCell 
          item={item} 
          column={column} 
          onUpdate={onUpdate} 
          boardItems={boardItems || []}
          activeStatusId={activeStatusId}
          setActiveStatusId={setActiveStatusId}
        />
      );
    case "priority":
      return (
        <PriorityCell 
          item={item} 
          column={column} 
          onUpdate={onUpdate}
          activeStatusId={activeStatusId}
          setActiveStatusId={setActiveStatusId}
        />
      );
    case "files":
      return <FilesCell item={item} column={column} onUpdate={onUpdate} />;
    case "dependency":
      return (
        <DependencyCell 
          item={item} 
          column={column} 
          onUpdate={onUpdate} 
          boardItems={boardItems || []} 
          columns={columns || []}
          activeStatusId={activeStatusId}
          setActiveStatusId={setActiveStatusId}
        />
      );
    case "formula":
      return (
        <FormulaCell
          item={item}
          column={column}
          boardItems={boardItems || []}
          columns={columns || []}
        />
      );
    case "checkbox":
      return <CheckboxCell item={item} column={column} onUpdate={onUpdate} />;
    case "link":
      return <LinkCell item={item} column={column} onUpdate={onUpdate} />;
    case "rating":
      return <RatingCell item={item} column={column} onUpdate={onUpdate} />;
    case "relation":
      return <RelationCell item={item} column={column} />;
    case "button":
      return <ButtonCell item={item} column={column} onUpdate={onUpdate} />;
    default: {
      const width = getColumnWidth(column.type);
      return (
        <div className={`${width} border-r border-gray-200 dark:border-slate-700 shrink-0 bg-gray-50 dark:bg-slate-800`}></div>
      );
    }
  }
}
