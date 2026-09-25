/**
 * The Portfolio overview: every shared workspace side by side.
 *
 * Privacy is not decided here. Items arrive through RLS (`can_access_board`),
 * so a board the viewer cannot open contributes no rows at all. What this
 * module adds is the scope rule on top: private workspaces and private boards
 * stay out even when the viewer can open them, because this page is about
 * shared work.
 */

import type { Board, Item, Profile, Workspace } from "@/types";
import { itemStatusSemantic, firstStatusValue } from "@/lib/statusSemantics";
import { assigneeIdsOf, DUE_SOON_DAYS } from "@/lib/dashboard/metrics";
import {
  addDaysOnly,
  daysBetween,
  durationDays,
  endDateOf,
  startDateOf,
  toDateOnly,
} from "@/lib/gantt/dates";

/** Most serious first; an item is listed once, under its first matching reason. */
export const ATTENTION_REASONS = ["overdue", "stuck", "dueSoon", "noStatus", "unassigned"] as const;
export type AttentionReason = (typeof ATTENTION_REASONS)[number];

/** Share of dated tasks whose end marks the solid part of a timeline bar. */
export const CORE_SHARE = 0.9;

export interface PortfolioCard {
  workspace: Workspace;
  total: number;
  done: number;
  donePct: number;
  open: number;
  overdue: number;
  stuck: number;
  attention: number;
  /** Soonest due date among unfinished tasks that are not late yet. */
  nextDue: Date | null;
  /** Latest end date of any task, shown once everything is done. */
  lastEnd: Date | null;
}

export interface PortfolioAttentionItem {
  itemId: string;
  boardId: string;
  workspaceId: string;
  name: string;
  boardName: string;
  reason: AttentionReason;
  /** Whole days from today to the due date; null when the task has none. */
  offsetDays: number | null;
  ownerName: string | null;
  /** An assignee id that no longer resolves to a person (deleted account). */
  ownerUnknown: boolean;
  extraOwners: number;
}

export interface PortfolioSpan {
  workspace: Workspace;
  start: Date;
  /** End of the solid bar: where CORE_SHARE of dated tasks had finished. */
  coreEnd: Date;
  /** The very last end date, which may trail far behind coreEnd. */
  end: Date;
  coreDays: number;
}

export interface PortfolioMetrics {
  cards: PortfolioCard[];
  attention: PortfolioAttentionItem[];
  spans: PortfolioSpan[];
  /** Workspaces with tasks but no dates, so the timeline can say who is missing. */
  undated: Workspace[];
}

/** Shared workspaces and their shared boards. A null board flag inherits the workspace's. */
export function portfolioBoards(workspaces: Workspace[], boards: Board[]): Board[] {
  const shared = new Set(workspaces.filter((w) => !w.is_private).map((w) => w.id));
  return boards.filter((b) => !!b.workspace_id && shared.has(b.workspace_id) && b.is_private !== true);
}

/** First date or timeline cell holding a value, read as a start/end pair. */
function datesOf(board: Board, item: Item): { start: Date; end: Date } | null {
  const values = item.column_values || {};
  for (const col of board.columns || []) {
    if (col.type !== "date" && col.type !== "timeline") continue;
    const raw = values[col.id];
    const end = endDateOf(raw);
    const start = startDateOf(raw) ?? end;
    if (!end || !start) continue;
    return start <= end ? { start, end } : { start: end, end: start };
  }
  return null;
}

export function computePortfolio(
  workspaces: Workspace[],
  boards: Board[],
  items: Item[],
  profiles: Profile[],
  now: Date = new Date()
): PortfolioMetrics {
  const eligible = portfolioBoards(workspaces, boards);
  const boardById = new Map(eligible.map((b) => [b.id, b]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const todayStr = toDateOnly(now);
  const horizonStr = toDateOnly(addDaysOnly(now, DUE_SOON_DAYS - 1));

  type Acc = {
    card: PortfolioCard;
    starts: Date[];
    ends: Date[];
  };
  const byWorkspace = new Map<string, Acc>();
  for (const ws of workspaces) {
    if (!eligible.some((b) => b.workspace_id === ws.id)) continue;
    byWorkspace.set(ws.id, {
      card: {
        workspace: ws, total: 0, done: 0, donePct: 0, open: 0, overdue: 0, stuck: 0,
        attention: 0, nextDue: null, lastEnd: null,
      },
      starts: [],
      ends: [],
    });
  }

  const attention: PortfolioAttentionItem[] = [];

  for (const item of items) {
    if (item.deleted_at) continue;
    const board = boardById.get(item.board_id);
    if (!board?.workspace_id) continue;
    const acc = byWorkspace.get(board.workspace_id);
    if (!acc) continue;
    const { card } = acc;
    const columns = board.columns || [];

    card.total++;
    const semantic = itemStatusSemantic(columns, item.column_values);
    const finished = semantic === "done";

    const dates = datesOf(board, item);
    if (dates) {
      acc.starts.push(dates.start);
      acc.ends.push(dates.end);
      if (!card.lastEnd || dates.end > card.lastEnd) card.lastEnd = dates.end;
    }

    if (finished) {
      card.done++;
      continue;
    }
    card.open++;

    const dueStr = dates ? toDateOnly(dates.end) : null;
    const late = dueStr !== null && dueStr < todayStr;
    const soon = dueStr !== null && !late && dueStr <= horizonStr;
    if (late) card.overdue++;
    if (semantic === "stuck") card.stuck++;
    if (dates && !late && (!card.nextDue || dates.end < card.nextDue)) card.nextDue = dates.end;

    const assignees = assigneeIdsOf(board, item);
    const reason: AttentionReason | null = late
      ? "overdue"
      : semantic === "stuck"
        ? "stuck"
        : soon
          ? "dueSoon"
          : firstStatusValue(columns, item.column_values) === null
            ? "noStatus"
            : assignees.length === 0
              ? "unassigned"
              : null;
    if (!reason) continue;

    card.attention++;
    const owner = assignees[0] ? profileById.get(assignees[0]) : undefined;
    attention.push({
      itemId: item.id,
      boardId: board.id,
      workspaceId: board.workspace_id,
      name: item.name,
      boardName: board.name,
      reason,
      offsetDays: dates ? daysBetween(now, dates.end) : null,
      ownerName: owner?.full_name ?? null,
      ownerUnknown: assignees.length > 0 && !owner,
      extraOwners: Math.max(0, assignees.length - 1),
    });
  }

  const rank = (r: AttentionReason) => ATTENTION_REASONS.indexOf(r);
  attention.sort(
    (a, b) =>
      rank(a.reason) - rank(b.reason) ||
      (a.offsetDays ?? Infinity) - (b.offsetDays ?? Infinity) ||
      a.name.localeCompare(b.name)
  );

  const cards: PortfolioCard[] = [];
  const spans: PortfolioSpan[] = [];
  const undated: Workspace[] = [];

  for (const { card, starts, ends } of byWorkspace.values()) {
    card.donePct = card.total > 0 ? Math.round((card.done / card.total) * 100) : 0;
    cards.push(card);

    if (ends.length === 0) {
      if (card.total > 0) undated.push(card.workspace);
      continue;
    }
    const start = starts.reduce((a, b) => (b < a ? b : a));
    const sorted = [...ends].sort((a, b) => a.getTime() - b.getTime());
    const end = sorted[sorted.length - 1];
    const core = sorted[Math.max(0, Math.ceil(sorted.length * CORE_SHARE) - 1)];
    const coreEnd = core < start ? start : core;
    spans.push({ workspace: card.workspace, start, coreEnd, end, coreDays: durationDays(start, coreEnd) });
  }

  return { cards, attention, spans, undated };
}
