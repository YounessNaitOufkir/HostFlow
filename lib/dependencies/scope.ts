/**
 * Which tasks a dependency may point at, and how one reads once it does.
 *
 * The Dependency column could only ever see the board it sat on, so "travaux
 * waits on the permit" was unsayable the moment the permit lived on another
 * board - which on this account it usually does.
 *
 * Two rules govern what may be pointed at. Access is already settled by RLS, so
 * anything that arrives here is something the user may read. Privacy is not:
 * every user has a personal private workspace, and its contents have no business
 * appearing in a picker on a shared board. Private workspaces are excluded here
 * rather than relied upon to be uninteresting.
 */

import type { Board, Workspace } from "@/types";

/** Where a dependency's other end lives, relative to the task holding it. */
export type DependencyOrigin = "same-board" | "same-workspace" | "other-workspace";

export interface BoardRef {
  id: string;
  name: string;
  workspaceId: string | null;
  workspaceName: string;
}

/** A workspace nobody else should be shown the inside of. */
export function isPrivateWorkspace(
  workspaceId: string | null | undefined,
  workspaces: Workspace[]
): boolean {
  if (!workspaceId) return false;
  return workspaces.find((w) => w.id === workspaceId)?.is_private === true;
}

/**
 * Every board a dependency may point at, keyed by id.
 *
 * A board with no workspace is kept: it is not private, it is unfiled.
 */
export function pickableBoards(
  boards: Board[],
  workspaces: Workspace[]
): Map<string, BoardRef> {
  const out = new Map<string, BoardRef>();
  for (const board of boards) {
    const workspaceId = board.workspace_id ?? null;
    if (isPrivateWorkspace(workspaceId, workspaces)) continue;
    out.set(board.id, {
      id: board.id,
      name: board.name,
      workspaceId,
      workspaceName: workspaces.find((w) => w.id === workspaceId)?.name ?? "",
    });
  }
  return out;
}

export function originOf(
  homeBoardId: string,
  otherBoardId: string,
  boards: Map<string, BoardRef>
): DependencyOrigin {
  if (homeBoardId === otherBoardId) return "same-board";
  const home = boards.get(homeBoardId);
  const other = boards.get(otherBoardId);
  // An unresolvable board is treated as the further case: saying "elsewhere"
  // about something on this board is a smaller error than the reverse.
  if (!home || !other) return "other-workspace";
  return home.workspaceId === other.workspaceId ? "same-workspace" : "other-workspace";
}

/**
 * What sits in front of the task name on the chip.
 *
 * The board is always named for anything off-board, and the workspace joins it
 * once the link crosses properties - at that point "Lancement" is ambiguous,
 * since three properties each have a board by that name.
 */
export function chipPrefix(origin: DependencyOrigin, board: BoardRef | undefined): string | null {
  if (origin === "same-board" || !board) return null;
  if (origin === "same-workspace") return board.name;
  return board.workspaceName ? `${board.workspaceName} › ${board.name}` : board.name;
}

/** The whole chip, for a tooltip or a plain-text context. */
export function chipTitle(
  taskName: string,
  origin: DependencyOrigin,
  board: BoardRef | undefined
): string {
  const prefix = chipPrefix(origin, board);
  return prefix ? `${prefix} · ${taskName}` : taskName;
}

export interface CandidateGroup {
  boardId: string;
  /** Heading for the group: the board, with its workspace when it is elsewhere. */
  heading: string;
  origin: DependencyOrigin;
  items: { id: string; name: string }[];
}

/**
 * Search results arranged for reading: this board first, then everything else
 * alphabetically by where it lives.
 *
 * Grouping rather than a flat list because the same task name recurs across
 * properties - three boards called "Lancement" each have a "Permis" - and a flat
 * list of identical names is a coin toss.
 */
export function groupCandidates(
  homeBoardId: string,
  candidates: { id: string; name: string; board_id: string }[],
  boards: Map<string, BoardRef>
): CandidateGroup[] {
  const byBoard = new Map<string, CandidateGroup>();

  for (const candidate of candidates) {
    // Anything whose board is not pickable never reaches the list, private
    // workspaces included.
    const board = boards.get(candidate.board_id);
    if (!board) continue;

    let group = byBoard.get(candidate.board_id);
    if (!group) {
      const origin = originOf(homeBoardId, candidate.board_id, boards);
      group = {
        boardId: candidate.board_id,
        heading:
          origin === "other-workspace" && board.workspaceName
            ? `${board.workspaceName} › ${board.name}`
            : board.name,
        origin,
        items: [],
      };
      byBoard.set(candidate.board_id, group);
    }
    group.items.push({ id: candidate.id, name: candidate.name });
  }

  return Array.from(byBoard.values()).sort((a, b) => {
    if (a.boardId === homeBoardId) return -1;
    if (b.boardId === homeBoardId) return 1;
    return a.heading.localeCompare(b.heading);
  });
}
