"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./queryKeys";
import { escapeLike, MIN_SEARCH_LENGTH } from "./useDependencySearch";
import { firstStatusValue } from "@/lib/statusSemantics";
import { commentSnippet } from "@/lib/searchSnippet";
import type { Board, Workspace } from "@/types";

/**
 * Finding a task without knowing which board it is on.
 *
 * Search was per board, so "where was that task" had no answer unless you
 * already knew the board to open - which is the thing you were trying to find
 * out. Twenty boards over six workspaces makes that a real wall.
 *
 * The hard part is not the query, it is the ANSWER. Every property runs the
 * same lifecycle, so board names repeat and task names repeat with them: four
 * boards called Launch, a "Client handover" on each. A result that says only
 * the task name identifies nothing, which is why a hit carries its whole path
 * - workspace, board, group - and why the path is assembled here rather than
 * left to each caller to work out.
 *
 * Access needs no code: RLS settles it, so nothing comes back that the user
 * may not read. Trashed items are excluded - a deleted task turning up in a
 * search reads as a bug until you notice why.
 */

/** Matches to keep. Enough to be worth scrolling, short enough to read. */
const SEARCH_LIMIT = 60;

/** Comments are the secondary result, so they take a smaller share of the list. */
const COMMENT_LIMIT = 20;

export interface SearchHit {
  id: string;
  name: string;
  boardId: string;
  boardName: string;
  workspaceId: string | null;
  workspaceName: string;
  groupId: string;
  groupTitle: string;
  /** The item's status, if its board has a status column holding one. */
  status: string | null;
  /** User ids from the first people column, for the avatars on a row. */
  assigneeIds: string[];
  /** In the trash. Only ever set when the caller asked for deleted work. */
  deleted: boolean;
}

export interface CommentHit {
  id: string;
  /** The comment, tags stripped and cut around the match. Text, never markup. */
  snippet: string;
  authorName: string;
  createdAt: string;
  itemId: string;
  itemName: string;
  boardId: string;
  boardName: string;
  workspaceName: string;
}

export interface BoardMatch {
  id: string;
  name: string;
  workspaceName: string;
}

interface RawComment {
  id: string;
  body: string | null;
  author_name: string | null;
  created_at: string;
  item_id: string;
  items: { id: string; name: string; board_id: string } | { id: string; name: string; board_id: string }[] | null;
}

interface RawItem {
  id: string;
  name: string;
  board_id: string;
  group_id: string;
  column_values: Record<string, unknown> | null;
  deleted_at: string | null;
  groups: { title: string } | { title: string }[] | null;
}

/** PostgREST returns an embedded row as an object or a one-element array. */
function one<T>(embedded: T | T[] | null): T | null {
  if (!embedded) return null;
  return Array.isArray(embedded) ? embedded[0] ?? null : embedded;
}

/**
 * Tasks and boards matching a name, anywhere the user can see.
 *
 * `boards` and `workspaces` come from the caller's cached global queries
 * rather than from a join: they are already in memory, and a join would refetch
 * the same two tables on every keystroke.
 */
export function useGlobalSearch(
  query: string,
  boards: Board[],
  workspaces: Workspace[],
  enabled = true,
  includeDeleted = false
) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: queryKeys.globalSearch(
      `${trimmed.toLowerCase()}${includeDeleted ? "|+trash" : ""}`
    ),
    queryFn: async (): Promise<{
      items: SearchHit[];
      boards: BoardMatch[];
      comments: CommentHit[];
    }> => {
      const pattern = `%${escapeLike(trimmed)}%`;

      // Deleted work is out by default: a task you binned turning up in
      // results reads as a bug until you spot the badge. It is worth asking
      // for, though - "I deleted it and now I need it" is when people search
      // hardest - so it is a toggle rather than a rule.
      let itemQuery = supabase
        .from("items")
        .select("id, name, board_id, group_id, column_values, deleted_at, groups(title)")
        .ilike("name", pattern)
        .order("updated_at", { ascending: false })
        .limit(SEARCH_LIMIT);
      if (!includeDeleted) itemQuery = itemQuery.is("deleted_at", null);

      const { data, error } = await itemQuery;
      if (error) throw error;

      const boardById = new Map(boards.map((b) => [b.id, b]));
      const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

      const items: SearchHit[] = [];
      for (const raw of (data ?? []) as RawItem[]) {
        const board = boardById.get(raw.board_id);
        // A board missing from the cache is one this user cannot see. RLS
        // should have withheld its items too, so this is belt and braces
        // rather than a filter we depend on.
        if (!board) continue;

        const workspace = board.workspace_id ? workspaceById.get(board.workspace_id) : undefined;
        const columns = board.columns ?? [];
        const peopleCol = columns.find((c) => c.type === "people");
        const assignees = peopleCol ? raw.column_values?.[peopleCol.id] : null;

        items.push({
          id: raw.id,
          name: raw.name,
          boardId: raw.board_id,
          boardName: board.name,
          workspaceId: board.workspace_id ?? null,
          workspaceName: workspace?.name ?? "",
          groupId: raw.group_id,
          groupTitle: one(raw.groups)?.title ?? "",
          status: firstStatusValue(columns, raw.column_values),
          assigneeIds: Array.isArray(assignees) ? (assignees as string[]) : [],
          deleted: !!raw.deleted_at,
        });
      }

      // Comments, over the generated tsvector rather than ILIKE: the bodies are
      // HTML and a substring scan of them is both slow and wrong - it would
      // match tag names. websearch lets a person type "facture client" or a
      // quoted phrase and have it mean what they expect. RLS gates this the
      // same as everything else, which it did NOT before the read policy on
      // updates was fixed.
      const comments: CommentHit[] = [];
      const { data: rawComments, error: commentError } = await supabase
        .from("updates")
        .select(
          "id, body, author_name, created_at, item_id, items!inner(id, name, board_id)"
        )
        .is("deleted_at", null)
        .textSearch("search_tsv", trimmed, { type: "websearch", config: "simple" })
        .order("created_at", { ascending: false })
        .limit(COMMENT_LIMIT);

      // A failure here must not take the task results down with it: names are
      // the part people rely on, comments are the bonus.
      if (commentError) {
        console.warn("[search] comment search failed:", commentError.message);
      } else {
        for (const raw of (rawComments ?? []) as RawComment[]) {
          const item = one(raw.items);
          const board = item ? boardById.get(item.board_id) : undefined;
          if (!item || !board) continue;
          const workspace = board.workspace_id ? workspaceById.get(board.workspace_id) : undefined;
          comments.push({
            id: raw.id,
            snippet: commentSnippet(raw.body ?? "", trimmed),
            authorName: raw.author_name ?? "",
            createdAt: raw.created_at,
            itemId: item.id,
            itemName: item.name,
            boardId: item.board_id,
            boardName: board.name,
            workspaceName: workspace?.name ?? "",
          });
        }
      }

      // Boards are matched from the cache: the list is small, already loaded,
      // and asking the server for it would be a second round trip per keystroke.
      const needle = trimmed.toLowerCase();
      const boardHits: BoardMatch[] = boards
        .filter((b) => b.name.toLowerCase().includes(needle))
        .slice(0, 8)
        .map((b) => ({
          id: b.id,
          name: b.name,
          workspaceName: b.workspace_id
            ? workspaceById.get(b.workspace_id)?.name ?? ""
            : "",
        }));

      return { items, boards: boardHits, comments };
    },
    enabled: enabled && trimmed.length >= MIN_SEARCH_LENGTH,
    // Reopening the palette a moment later should not ask again.
    staleTime: 30_000,
  });
}
