"use client";

// ============================================================
// Column Registry — Single source of truth for column type metadata
// ============================================================
//
// Adding a new column type is now a single-file change:
// 1. Add the type to ColumnType in types/index.ts
// 2. Add an entry to COLUMN_REGISTRY below
// 3. Create the cell component
// ============================================================

import {
  AlignLeft,
  Calendar,
  CheckSquare,
  Hash,
  Link2,
  Paperclip,
  Settings2,
  Star,
  Tag,
  Users,
  Clock,
  AlertTriangle,
  Calculator,
  MousePointerClick,
} from "lucide-react";
import type { ColumnType, CellValue } from "@/types";
import type { TranslationKey } from "@/lib/i18n/types";
import type { LucideIcon } from "lucide-react";

export interface ColumnDefinition {
  /** The column type key */
  type: ColumnType;
  /** Human-readable label for menus */
  label: string;
  /**
   * The label's translation key. `label` is the English fallback; the menu
   * reads this. `defaultTitle` deliberately has no key - it is the value
   * written to the board, and lib/i18n/labels.ts translates it on the way out.
   */
  labelKey: TranslationKey;
  /** Default title when adding a new column of this type */
  defaultTitle: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Tailwind width class for the cell */
  widthClass: string;
  /** Default cell value for new items */
  defaultValue: CellValue;
  /** Whether GroupFooter can aggregate this column type */
  isAggregatable: boolean;
  /** Whether this column is read-only (e.g., formula) */
  isReadOnly: boolean;
  /** Category for the "Add Column" menu */
  category: "essential" | "advanced" | "computed";
  /**
   * Keep this type out of the "+ Add column" menu.
   *
   * The entry itself must stay: getColumnWidth and getDefaultTitle are looked up
   * for columns that ALREADY exist, boards still hold `date` columns, and the
   * spreadsheet importer can create types the menu no longer offers. Hiding is
   * therefore additive - never delete an entry to remove it from the menu.
   */
  hiddenFromMenu?: boolean;
}

/**
 * Central registry mapping column types to their metadata.
 * Used by ColumnHeader (width), CellRenderer (dispatch), 
 * AddColumn menu (label/icon), and GroupFooter (aggregation).
 */
export const COLUMN_REGISTRY: Record<ColumnType, ColumnDefinition> = {
  status: {
    type: "status",
    label: "Status",
    labelKey: "coltype.status",
    defaultTitle: "Status",
    icon: Settings2,
    widthClass: "w-32",
    defaultValue: null,
    isAggregatable: false,
    isReadOnly: false,
    category: "essential",
  },
  text: {
    type: "text",
    label: "Text",
    labelKey: "coltype.text",
    defaultTitle: "Text",
    icon: AlignLeft,
    widthClass: "w-48",
    defaultValue: "",
    isAggregatable: false,
    isReadOnly: false,
    category: "essential",
  },
  numbers: {
    type: "numbers",
    label: "Numbers",
    labelKey: "coltype.number",
    defaultTitle: "Numbers",
    icon: Hash,
    widthClass: "w-32",
    defaultValue: "",
    isAggregatable: true,
    isReadOnly: false,
    category: "essential",
    hiddenFromMenu: true,
  },
  date: {
    type: "date",
    label: "Date",
    labelKey: "coltype.date",
    defaultTitle: "Date",
    icon: Calendar,
    widthClass: "w-32",
    defaultValue: "",
    isAggregatable: false,
    isReadOnly: false,
    category: "essential",
    hiddenFromMenu: true,
  },
  people: {
    type: "people",
    label: "People",
    labelKey: "coltype.people",
    defaultTitle: "Assignee",
    icon: Users,
    widthClass: "w-36",
    defaultValue: [],
    isAggregatable: false,
    isReadOnly: false,
    category: "essential",
  },
  timeline: {
    type: "timeline",
    label: "Timeline",
    labelKey: "coltype.timeline",
    defaultTitle: "Timeline",
    icon: Clock,
    widthClass: "w-48",
    defaultValue: null,
    isAggregatable: false,
    isReadOnly: false,
    category: "essential",
  },
  tags: {
    type: "tags",
    label: "Tags",
    labelKey: "coltype.tags",
    defaultTitle: "Tags",
    icon: Tag,
    widthClass: "w-48",
    defaultValue: [],
    isAggregatable: false,
    isReadOnly: false,
    category: "essential",
  },
  priority: {
    type: "priority",
    label: "Priority",
    labelKey: "coltype.priority",
    defaultTitle: "Priority",
    icon: AlertTriangle,
    widthClass: "w-36",
    defaultValue: null,
    isAggregatable: false,
    isReadOnly: false,
    category: "essential",
  },
  files: {
    type: "files",
    label: "Files",
    labelKey: "coltype.files",
    defaultTitle: "Files",
    icon: Paperclip,
    widthClass: "w-40",
    defaultValue: [],
    isAggregatable: false,
    isReadOnly: false,
    category: "essential",
    hiddenFromMenu: true,
  },
  dependency: {
    type: "dependency",
    label: "Dependency",
    labelKey: "coltype.dependency",
    defaultTitle: "Dependency",
    icon: Link2,
    widthClass: "w-48",
    defaultValue: [],
    isAggregatable: false,
    isReadOnly: false,
    category: "advanced",
  },
  formula: {
    type: "formula",
    label: "Formula",
    labelKey: "coltype.formula",
    defaultTitle: "Formula",
    icon: Calculator,
    widthClass: "w-36",
    defaultValue: null,
    isAggregatable: true,
    isReadOnly: true,
    category: "computed",
    hiddenFromMenu: true,
  },
  checkbox: {
    type: "checkbox",
    label: "Checkbox",
    labelKey: "coltype.checkbox",
    defaultTitle: "Done",
    icon: CheckSquare,
    widthClass: "w-24",
    defaultValue: false,
    isAggregatable: false,
    isReadOnly: false,
    category: "advanced",
  },
  link: {
    type: "link",
    label: "Link",
    labelKey: "coltype.link",
    defaultTitle: "Link",
    icon: Link2,
    widthClass: "w-48",
    defaultValue: null,
    isAggregatable: false,
    isReadOnly: false,
    category: "advanced",
    hiddenFromMenu: true,
  },
  rating: {
    type: "rating",
    label: "Rating",
    labelKey: "coltype.rating",
    defaultTitle: "Rating",
    icon: Star,
    widthClass: "w-32",
    defaultValue: 0,
    isAggregatable: true,
    isReadOnly: false,
    category: "advanced",
    hiddenFromMenu: true,
  },
  relation: {
    type: "relation",
    label: "Relation",
    labelKey: "coltype.relation",
    defaultTitle: "Relation",
    icon: Link2,
    widthClass: "w-48",
    defaultValue: [],
    isAggregatable: false,
    isReadOnly: false,
    category: "advanced",
    hiddenFromMenu: true,
  },
  button: {
    type: "button",
    label: "Button",
    labelKey: "coltype.button",
    defaultTitle: "Button",
    icon: MousePointerClick,
    widthClass: "w-32",
    defaultValue: "Click when done",
    isAggregatable: false,
    isReadOnly: false,
    category: "advanced",
    hiddenFromMenu: true,
  },
};

/**
 * Get all column definitions for a given category.
 * Used by the "Add Column" dropdown menu.
 */
export function getColumnsByCategory(category: ColumnDefinition["category"]): ColumnDefinition[] {
  return Object.values(COLUMN_REGISTRY).filter(
    (col) => col.category === category && !col.hiddenFromMenu
  );
}

/**
 * Get the width class for a column type.
 * Replaces the scattered widthMap objects throughout the codebase.
 */
export function getColumnWidth(type: ColumnType): string {
  return COLUMN_REGISTRY[type]?.widthClass || "w-32";
}

/**
 * Get the default title when adding a column of this type.
 * Replaces the if/else chain in handleAddColumn.
 */
export function getDefaultTitle(type: ColumnType): string {
  return COLUMN_REGISTRY[type]?.defaultTitle || type.charAt(0).toUpperCase() + type.slice(1);
}
