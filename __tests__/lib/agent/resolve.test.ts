import { describe, it, expect } from "vitest";
import type { Board, Column, Group, Workspace } from "@/types";
import {
  boardLabel,
  normalizeName,
  resolveBoard,
  resolveGroup,
  resolvePerson,
  resolveStatusLabel,
  splitBoardReference,
} from "@/lib/agent/resolve";

const workspaces: Workspace[] = [
  { id: "wA", name: "App A", created_at: "" },
  { id: "wC", name: "App C", created_at: "" },
  { id: "wE", name: "Équipe", created_at: "" },
];

const board = (id: string, name: string, workspace_id: string): Board =>
  ({ id, name, workspace_id, description: "", columns: [] }) as Board;

const boards: Board[] = [
  board("b1", "Lancement", "wA"),
  board("b2", "Lancement", "wC"),
  board("b3", "Travaux", "wC"),
  board("b4", "Planning", "wE"),
];

describe("resolveBoard", () => {
  it("never picks between same-named boards: it returns them as Workspace › Board", () => {
    const result = resolveBoard({ board: "Lancement" }, boards, workspaces);
    expect(result).toEqual({ kind: "many", options: ["App A › Lancement", "App C › Lancement"] });
  });

  it("settles on one board once the workspace is named", () => {
    const result = resolveBoard({ workspace: "app c", board: "lancement" }, boards, workspaces);
    expect(result.kind).toBe("one");
    expect(result.kind === "one" && result.value.id).toBe("b2");
  });

  it("accepts a partial name when only one board contains it", () => {
    const result = resolveBoard({ board: "trav" }, boards, workspaces);
    expect(result.kind === "one" && result.value.id).toBe("b3");
  });

  it("ignores accents and case", () => {
    const result = resolveBoard({ workspace: "equipe", board: "PLANNING" }, boards, workspaces);
    expect(result.kind === "one" && result.value.id).toBe("b4");
  });

  it("lists what exists when nothing matches", () => {
    const result = resolveBoard({ board: "Livraison" }, boards, workspaces);
    expect(result.kind).toBe("none");
    expect(result.kind === "none" && result.options).toContain("App C › Travaux");
  });

  it("lists the workspaces when the workspace itself is unknown", () => {
    const result = resolveBoard({ workspace: "App Z", board: "Lancement" }, boards, workspaces);
    expect(result).toEqual({ kind: "none", options: ["App A", "App C", "Équipe"] });
  });
});

describe("splitBoardReference", () => {
  it("reads every separator people type", () => {
    expect(splitBoardReference("App C › Lancement")).toEqual({ workspace: "App C", board: "Lancement" });
    expect(splitBoardReference("App C > Lancement")).toEqual({ workspace: "App C", board: "Lancement" });
    expect(splitBoardReference("App C / Lancement")).toEqual({ workspace: "App C", board: "Lancement" });
    expect(splitBoardReference("Lancement")).toEqual({ board: "Lancement" });
  });
});

describe("boardLabel", () => {
  it("names the board by its workspace, falling back to the bare name", () => {
    expect(boardLabel(boards[1], workspaces)).toBe("App C › Lancement");
    expect(boardLabel(board("bx", "Orphan", "gone"), workspaces)).toBe("Orphan");
  });
});

describe("resolveGroup", () => {
  const groups: Group[] = [
    { id: "g2", title: "Completed", color: "", position: 5, board_id: "b1" },
    { id: "g1", title: "À faire", color: "", position: 0, board_id: "b1" },
  ];

  it("defaults to the board's first group, as typing a new row does", () => {
    const result = resolveGroup(groups, null);
    expect(result.kind === "one" && result.value.id).toBe("g1");
  });

  it("finds a group by name, accents optional", () => {
    const result = resolveGroup(groups, "a faire");
    expect(result.kind === "one" && result.value.id).toBe("g1");
  });

  it("lists the groups when the name is unknown", () => {
    expect(resolveGroup(groups, "Backlog")).toEqual({ kind: "none", options: ["À faire", "Completed"] });
  });

  it("has nothing to offer a board with no groups", () => {
    expect(resolveGroup([], null)).toEqual({ kind: "none", options: [] });
  });
});

describe("resolveStatusLabel", () => {
  const english: Column = {
    id: "s",
    title: "Status",
    type: "status",
    settings: {
      statusLabels: [
        { label: "Not Started", color: "" },
        { label: "Working on it", color: "" },
        { label: "Stuck", color: "" },
        { label: "Done", color: "" },
      ],
    },
  } as Column;
  const french: Column = {
    id: "s",
    title: "Statut",
    type: "status",
    settings: {
      statusLabels: [
        { label: "En cours", color: "" },
        { label: "Bloqué", color: "" },
        { label: "Fait", color: "" },
      ],
    },
  } as Column;

  it("takes the board's own label as written", () => {
    expect(resolveStatusLabel(english, "working on it")).toEqual({ kind: "one", value: "Working on it" });
  });

  it("maps a meaning onto the board's word, in either language", () => {
    expect(resolveStatusLabel(french, "done")).toEqual({ kind: "one", value: "Fait" });
    expect(resolveStatusLabel(english, "fait")).toEqual({ kind: "one", value: "Done" });
    expect(resolveStatusLabel(french, "stuck")).toEqual({ kind: "one", value: "Bloqué" });
  });

  it("returns the board's labels when the request means nothing it has", () => {
    expect(resolveStatusLabel(french, "waiting for parts")).toEqual({
      kind: "none",
      options: ["En cours", "Bloqué", "Fait"],
    });
  });

  it("does not read 'not done' as done", () => {
    expect(resolveStatusLabel(english, "not done").kind).toBe("none");
  });

  it("asks when two labels share the meaning", () => {
    const two: Column = {
      ...english,
      settings: { statusLabels: [{ label: "Done", color: "" }, { label: "Completed", color: "" }] },
    } as Column;
    expect(resolveStatusLabel(two, "finished")).toEqual({ kind: "many", options: ["Done", "Completed"] });
  });
});

describe("resolvePerson", () => {
  const people = [
    { id: "u1", full_name: "Youssef Alami" },
    { id: "u2", full_name: "Youssef Bennani" },
    { id: "u3", full_name: "Salma Idrissi" },
  ];

  it("finds a unique first name", () => {
    const result = resolvePerson(people, "salma");
    expect(result.kind === "one" && result.value.id).toBe("u3");
  });

  it("asks when a first name is shared", () => {
    expect(resolvePerson(people, "Youssef")).toEqual({
      kind: "many",
      options: ["Youssef Alami", "Youssef Bennani"],
    });
  });

  it("finds nobody outside the directory it was given", () => {
    expect(resolvePerson(people, "Karim")).toEqual({ kind: "none", options: [] });
  });
});

describe("normalizeName", () => {
  it("folds accents, case and spacing", () => {
    expect(normalizeName("  Équipe   Été ")).toBe("equipe ete");
  });
});
