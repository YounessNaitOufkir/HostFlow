import { describe, it, expect } from "vitest";
import {
  pickableBoards,
  isPrivateWorkspace,
  originOf,
  chipPrefix,
  chipTitle,
  groupCandidates,
} from "@/lib/dependencies/scope";
import type { Board, Workspace } from "@/types";

const workspaces = [
  { id: "ws-a", name: "Studio A", is_private: false },
  { id: "ws-b", name: "App D", is_private: false },
  { id: "ws-mine", name: "My Workspace", is_private: true },
] as unknown as Workspace[];

const boards = [
  { id: "b1", name: "Lancement", workspace_id: "ws-a" },
  { id: "b2", name: "Communication", workspace_id: "ws-a" },
  { id: "b3", name: "Lancement", workspace_id: "ws-b" },
  { id: "b-priv", name: "Personal notes", workspace_id: "ws-mine" },
  { id: "b-loose", name: "Unfiled", workspace_id: undefined },
] as unknown as Board[];

const refs = pickableBoards(boards, workspaces);

describe("what may be pointed at", () => {
  it("leaves private workspaces out entirely", () => {
    // Every user has a personal private workspace; its contents have no
    // business appearing in a picker on a shared board.
    expect(refs.has("b-priv")).toBe(false);
    expect(isPrivateWorkspace("ws-mine", workspaces)).toBe(true);
  });

  it("keeps the shared ones", () => {
    expect([...refs.keys()].sort()).toEqual(["b-loose", "b1", "b2", "b3"]);
  });

  it("keeps a board with no workspace — unfiled is not private", () => {
    expect(refs.get("b-loose")?.workspaceName).toBe("");
    expect(isPrivateWorkspace(null, workspaces)).toBe(false);
  });

  it("carries the workspace name, since board names repeat across properties", () => {
    expect(refs.get("b1")?.workspaceName).toBe("Studio A");
    expect(refs.get("b3")?.workspaceName).toBe("App D");
    expect(refs.get("b1")?.name).toBe(refs.get("b3")?.name);
  });
});

describe("originOf", () => {
  it("tells the three cases apart", () => {
    expect(originOf("b1", "b1", refs)).toBe("same-board");
    expect(originOf("b1", "b2", refs)).toBe("same-workspace");
    expect(originOf("b1", "b3", refs)).toBe("other-workspace");
  });

  it("treats an unresolvable board as the further case", () => {
    // Saying "elsewhere" about something on this board is a smaller error than
    // quietly calling a foreign task local.
    expect(originOf("b1", "b-priv", refs)).toBe("other-workspace");
    expect(originOf("b-priv", "b1", refs)).toBe("other-workspace");
  });
});

describe("what the chip says", () => {
  it("says nothing extra for a task on this board", () => {
    expect(chipPrefix("same-board", refs.get("b1"))).toBeNull();
    expect(chipTitle("Devis", "same-board", refs.get("b1"))).toBe("Devis");
  });

  it("names the board for another board in the same property", () => {
    expect(chipPrefix("same-workspace", refs.get("b2"))).toBe("Communication");
    expect(chipTitle("Livraison", "same-workspace", refs.get("b2"))).toBe(
      "Communication · Livraison"
    );
  });

  it("adds the property once the link crosses one", () => {
    // Three properties each have a board called "Lancement", so the board name
    // alone stops identifying anything.
    expect(chipPrefix("other-workspace", refs.get("b3"))).toBe("App D › Lancement");
    expect(chipTitle("Permis", "other-workspace", refs.get("b3"))).toBe(
      "App D › Lancement · Permis"
    );
  });

  it("falls back to the board when there is no workspace to name", () => {
    expect(chipPrefix("other-workspace", refs.get("b-loose"))).toBe("Unfiled");
  });
});

describe("groupCandidates", () => {
  const found = [
    { id: "i1", name: "Permis de démolir", board_id: "b1" },
    { id: "i2", name: "Permis d'affichage", board_id: "b2" },
    { id: "i3", name: "Permis de construire", board_id: "b3" },
    { id: "i4", name: "Permis privé", board_id: "b-priv" },
  ];

  it("puts this board first and the rest in name order", () => {
    const groups = groupCandidates("b1", found, refs);
    expect(groups.map((g) => g.heading)).toEqual([
      "Lancement",
      "App D › Lancement",
      "Communication",
    ]);
  });

  it("drops anything in a private workspace", () => {
    const groups = groupCandidates("b1", found, refs);
    expect(groups.some((g) => g.boardId === "b-priv")).toBe(false);
    expect(groups.flatMap((g) => g.items).map((i) => i.id)).not.toContain("i4");
  });

  it("marks each group with where it sits relative to the task", () => {
    const groups = groupCandidates("b1", found, refs);
    expect(groups.find((g) => g.boardId === "b1")?.origin).toBe("same-board");
    expect(groups.find((g) => g.boardId === "b2")?.origin).toBe("same-workspace");
    expect(groups.find((g) => g.boardId === "b3")?.origin).toBe("other-workspace");
  });

  it("keeps every match, including identically named ones", () => {
    const groups = groupCandidates("b1", found, refs);
    expect(groups.flatMap((g) => g.items)).toHaveLength(3);
  });

  it("returns nothing when nothing matched", () => {
    expect(groupCandidates("b1", [], refs)).toEqual([]);
  });
});
