import type { Column, GanttConfig } from "@/types";
import { addDaysOnly, daysBetween, parseDateOnly, shiftDateOnlyValue, startDateOf, toDateOnly } from "@/lib/gantt/dates";
import { marksDone } from "@/lib/doneLink";

/**
 * A company template as save_board_template() stores it: the board's plan,
 * with who was assigned, each task's status and attached files already
 * removed (see 20260928000002_board_templates.sql).
 */
export interface TemplateSnapshot {
  version: number;
  board: {
    description: string | null;
    columns: Column[];
    item_name_column: string | null;
    gantt_config: GanttConfig | null;
  };
  groups: { id: string; title: string; color: string | null; position: number | null }[];
  items: {
    id: string;
    name: string;
    group_id: string;
    position: number | null;
    column_values: Record<string, unknown>;
  }[];
  links: {
    source_item_id: string;
    target_item_id: string;
    link_type: string;
    dep_type: string;
    lag_days: number;
  }[];
  automations: {
    trigger_column_id: string;
    trigger_value: string;
    action_type: string;
    action_target_id: string;
    action_payload: Record<string, unknown> | null;
    enabled: boolean | null;
  }[];
}

/** The rows to insert for a new board built from a template. */
export interface BoardFromTemplate {
  board: {
    id: string;
    name: string;
    description: string | null;
    workspace_id: string;
    columns: Column[];
    item_name_column: string | null;
    gantt_config: GanttConfig | null;
  };
  groups: { id: string; board_id: string; title: string; color: string | null; position: number }[];
  items: {
    id: string;
    board_id: string;
    group_id: string;
    name: string;
    position: number;
    column_values: Record<string, unknown>;
  }[];
  links: {
    source_item_id: string;
    target_item_id: string;
    link_type: string;
    dep_type: string;
    lag_days: number;
  }[];
  automations: {
    board_id: string;
    trigger_column_id: string;
    trigger_value: string;
    action_type: string;
    action_target_id: string;
    action_payload: Record<string, unknown>;
    enabled: boolean;
  }[];
  /** Days every date moved by, so the first one falls on the start day. */
  shiftDays: number;
}

/** Values that belong to one project, not to the plan. The database strips them already; this is the second lock. */
const CLEARED_TYPES = new Set(["people", "status", "files"]);
const DATE_TYPES = new Set(["date", "timeline"]);

/** The earliest date anywhere in the template's date and timeline columns. */
export function earliestTemplateDate(snapshot: TemplateSnapshot): Date | null {
  const dateColumns = snapshot.board.columns.filter((c) => DATE_TYPES.has(c.type));
  let earliest: Date | null = null;
  for (const item of snapshot.items) {
    for (const col of dateColumns) {
      const d = startDateOf(item.column_values?.[col.id]);
      if (d && (!earliest || d < earliest)) earliest = d;
    }
  }
  return earliest;
}

/**
 * Builds a new board from a template.
 *
 * Column ids are kept: they only have to be unique within a board, and keeping
 * them means formulas, Gantt settings and automations that name a column keep
 * working, as do workspace automations written against the template's columns.
 * Groups and tasks get new ids, and everything that points at one - a task's
 * group, a dependency, a "move to group" automation - is re-pointed.
 *
 * Dates keep their shape: the earliest one lands on `startDay` and every other
 * date moves by the same number of days, so durations and gaps are unchanged.
 */
export function buildBoardFromTemplate(
  snapshot: TemplateSnapshot,
  opts: { workspaceId: string; name: string; startDay: Date; newId?: () => string }
): BoardFromTemplate {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const boardId = newId();
  const columns = snapshot.board.columns ?? [];
  const columnType = new Map(columns.map((c) => [c.id, c.type]));
  // A "Done" box is the status by another name: cleared with it, so a new
  // board does not start with ticked boxes on unfinished tasks.
  const doneBoxes = new Set(
    columns.filter((c) => marksDone(c, { gantt_config: snapshot.board.gantt_config })).map((c) => c.id)
  );

  const earliest = earliestTemplateDate(snapshot);
  const start = new Date(opts.startDay.getFullYear(), opts.startDay.getMonth(), opts.startDay.getDate());
  const shiftDays = earliest ? daysBetween(earliest, start) : 0;

  const groupIds = new Map<string, string>();
  const groups = [...snapshot.groups]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((g, index) => {
      const id = newId();
      groupIds.set(g.id, id);
      return { id, board_id: boardId, title: g.title, color: g.color, position: index };
    });
  // Tasks with nowhere to go would fail the insert and leave an empty board.
  if (groups.length === 0 && snapshot.items.length > 0) {
    groups.push({ id: newId(), board_id: boardId, title: "Tasks", color: "#579bfc", position: 0 });
  }

  const itemIds = new Map<string, string>();
  for (const item of snapshot.items) itemIds.set(item.id, newId());

  const items = [...snapshot.items]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((item, index) => {
      const values: Record<string, unknown> = {};
      for (const [colId, value] of Object.entries(item.column_values ?? {})) {
        const type = columnType.get(colId);
        if (!type || CLEARED_TYPES.has(type) || doneBoxes.has(colId)) continue;
        if (DATE_TYPES.has(type)) {
          values[colId] = shiftDateOnlyValue(value, shiftDays);
        } else if (type === "dependency") {
          // The tasks this one waits for, as ids: re-pointed to the new tasks.
          const deps = Array.isArray(value) ? value : [];
          values[colId] = deps.map((d) => itemIds.get(String(d))).filter(Boolean);
        } else {
          values[colId] = value;
        }
      }
      return {
        id: itemIds.get(item.id)!,
        board_id: boardId,
        group_id: groupIds.get(item.group_id) ?? groups[0].id,
        name: item.name,
        position: index,
        column_values: values,
      };
    });

  const links = snapshot.links
    .filter((l) => itemIds.has(l.source_item_id) && itemIds.has(l.target_item_id))
    .map((l) => ({
      source_item_id: itemIds.get(l.source_item_id)!,
      target_item_id: itemIds.get(l.target_item_id)!,
      link_type: l.link_type,
      dep_type: l.dep_type,
      lag_days: l.lag_days,
    }));

  const automations = snapshot.automations.map((a) => {
    const payload = { ...(a.action_payload ?? {}) };
    if (typeof payload.groupId === "string" && groupIds.has(payload.groupId)) {
      payload.groupId = groupIds.get(payload.groupId);
    }
    return {
      board_id: boardId,
      trigger_column_id: a.trigger_column_id,
      trigger_value: a.trigger_value,
      action_type: a.action_type,
      // "Move to group" names its group here.
      action_target_id: groupIds.get(a.action_target_id) ?? a.action_target_id,
      action_payload: payload,
      enabled: a.enabled ?? true,
    };
  });

  let gantt: GanttConfig | null = snapshot.board.gantt_config ?? null;
  if (gantt?.targetFinish) {
    const finish = parseDateOnly(gantt.targetFinish);
    gantt = { ...gantt, targetFinish: finish ? toDateOnly(addDaysOnly(finish, shiftDays)) : undefined };
  }

  return {
    board: {
      id: boardId,
      name: opts.name,
      description: snapshot.board.description,
      workspace_id: opts.workspaceId,
      columns,
      item_name_column: snapshot.board.item_name_column,
      gantt_config: gantt,
    },
    groups,
    items,
    links,
    automations,
    shiftDays,
  };
}
