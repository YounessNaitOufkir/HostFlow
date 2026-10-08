import type { Board, Column, Group, Workspace } from "@/types";
import { statusOptionsOf } from "@/lib/doneLink";
import { statusSemanticOf } from "@/lib/statusSemantics";
import { withoutBlankOption } from "@/lib/cellDefaults";

/**
 * Turning what a person said ("Lancement", "fait", "Youssef") into the one
 * board, status label or person it means - or into the list of what it could
 * mean, so Claude asks instead of guessing.
 *
 * Pure: the connector's tools load the data and hand it in.
 */

/** "Équipe  A" and "equipe a" are the same name to a person typing it. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "App C › Lancement". A workspace is one property and its boards are that
 * property's lifecycle phases, so a board's own name identifies nothing.
 */
export function boardLabel(board: Board, workspaces: Workspace[]): string {
  const workspace = workspaces.find((w) => w.id === board.workspace_id);
  return workspace ? `${workspace.name} › ${board.name}` : board.name;
}

/** Exact matches if there are any, otherwise everything containing the query. */
function closest<T>(items: T[], nameOf: (item: T) => string, query: string): T[] {
  const q = normalizeName(query);
  if (!q) return [];
  const exact = items.filter((i) => normalizeName(nameOf(i)) === q);
  if (exact.length > 0) return exact;
  return items.filter((i) => normalizeName(nameOf(i)).includes(q));
}

export type Resolution<T> =
  | { kind: "one"; value: T }
  /** Several fit. `options` is what to show the person. */
  | { kind: "many"; options: string[] }
  /** Nothing fits. `options` is what does exist, when there is a short list. */
  | { kind: "none"; options: string[] };

/**
 * Split "App C › Lancement" (or "App C > Lancement", "App C / Lancement") into
 * its workspace and board parts. A bare name has no workspace part.
 */
export function splitBoardReference(reference: string): { workspace?: string; board: string } {
  const parts = reference.split(/\s*(?:›|>|\/)\s*/).filter(Boolean);
  if (parts.length >= 2) {
    return { workspace: parts.slice(0, -1).join(" "), board: parts[parts.length - 1] };
  }
  return { board: reference.trim() };
}

export function resolveBoard(
  reference: { workspace?: string | null; board: string },
  boards: Board[],
  workspaces: Workspace[]
): Resolution<Board> {
  let pool = boards;
  if (reference.workspace) {
    const matchedWorkspaces = closest(workspaces, (w) => w.name, reference.workspace);
    if (matchedWorkspaces.length === 0) {
      return { kind: "none", options: workspaces.map((w) => w.name).sort().slice(0, 30) };
    }
    const ids = new Set(matchedWorkspaces.map((w) => w.id));
    pool = boards.filter((b) => b.workspace_id && ids.has(b.workspace_id));
  }

  const matches = closest(pool, (b) => b.name, reference.board);
  if (matches.length === 1) return { kind: "one", value: matches[0] };
  if (matches.length > 1) {
    return { kind: "many", options: matches.map((b) => boardLabel(b, workspaces)).sort() };
  }
  return {
    kind: "none",
    options: pool.length <= 30 ? pool.map((b) => boardLabel(b, workspaces)).sort() : [],
  };
}

/** The group named, or the board's first group - the app's default for a new task. */
export function resolveGroup(groups: Group[], name?: string | null): Resolution<Group> {
  const ordered = [...groups].sort((a, b) => a.position - b.position);
  if (!name) {
    return ordered.length > 0
      ? { kind: "one", value: ordered[0] }
      : { kind: "none", options: [] };
  }
  const matches = closest(ordered, (g) => g.title, name);
  if (matches.length === 1) return { kind: "one", value: matches[0] };
  return {
    kind: matches.length > 1 ? "many" : "none",
    options: (matches.length > 1 ? matches : ordered).map((g) => g.title),
  };
}

/**
 * The board's own label for the status a person asked for.
 *
 * Exact label first ("Working on it"). Then by meaning, so "done" finds "Fait"
 * on the French board and "fait" finds "Done" on an English one - the same
 * reading lib/statusSemantics gives everywhere else. Only a single answer is
 * accepted; two labels that both mean done are the board's to choose between.
 */
export function resolveStatusLabel(column: Column, wanted: string): Resolution<string> {
  const options = withoutBlankOption(statusOptionsOf(column));
  const labels = options.map((o) => o.label);

  const exact = closest(options, (o) => o.label, wanted);
  if (exact.length === 1) return { kind: "one", value: exact[0].label };
  if (exact.length > 1) return { kind: "many", options: exact.map((o) => o.label) };

  const meaning = statusSemanticOf(wanted);
  if (meaning) {
    const sameMeaning = options.filter((o) => statusSemanticOf(o.label, options) === meaning);
    if (sameMeaning.length === 1) return { kind: "one", value: sameMeaning[0].label };
    if (sameMeaning.length > 1) return { kind: "many", options: sameMeaning.map((o) => o.label) };
  }
  return { kind: "none", options: labels };
}

export interface DirectoryPerson {
  id: string;
  full_name: string;
  role?: "admin" | "member" | null;
  is_staff?: boolean | null;
}

/**
 * A colleague by name: the full name, or any unambiguous part of it ("Youssef"
 * when there is one Youssef). The directory passed in is already the people
 * the caller can see, so a name outside it is simply not found.
 */
export function resolvePerson(directory: DirectoryPerson[], wanted: string): Resolution<DirectoryPerson> {
  const named = directory.filter((p) => p.full_name);
  const matches = closest(named, (p) => p.full_name, wanted);
  if (matches.length === 1) return { kind: "one", value: matches[0] };
  if (matches.length > 1) return { kind: "many", options: matches.map((p) => p.full_name).sort() };
  return { kind: "none", options: [] };
}
