import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import MissionControlView from "@/components/MissionControlView";
import { addDaysOnly, toDateOnly, today } from "@/lib/gantt/dates";
import type { Board, Item, ItemLink, Workspace } from "@/types";

const hookState = vi.hoisted(() => ({
  value: {
    loading: false,
    error: null as unknown,
    items: [] as unknown[],
    groups: [] as unknown[],
    itemLinks: [] as unknown[],
    automationsFor: () => [],
    refresh: vi.fn(),
  },
}));

vi.mock("@/hooks/useWorkspaceGanttData", () => ({
  useWorkspaceGanttData: () => hookState.value,
}));

const day = (offset: number) => toDateOnly(addDaysOnly(today(), offset));

const COLS = [
  { id: "st", title: "Status", type: "status" },
  { id: "w", title: "Waiting on", type: "waiting_on" },
] as Board["columns"];
const PLAIN = [{ id: "st", title: "Status", type: "status" }] as Board["columns"];

const workspaces = [{ id: "ws-agdal", name: "Agdal T3" }] as Workspace[];
const boards = [{ id: "b1", name: "Rénovation", workspace_id: "ws-agdal", columns: COLS }] as Board[];

const item = (id: string, column_values: Record<string, unknown>): Item =>
  ({ id, name: id, board_id: "b1", group_id: "g", position: 0, column_values }) as Item;

function setData(items: Item[], itemLinks: ItemLink[] = [], extra: Partial<typeof hookState.value> = {}) {
  hookState.value = { ...hookState.value, loading: false, error: null, items, itemLinks, ...extra };
}

function renderView(overrides: Partial<React.ComponentProps<typeof MissionControlView>> = {}) {
  const onOpenTask = vi.fn();
  const onUpdateCell = vi.fn();
  render(
    <MissionControlView
      boards={boards}
      workspaces={workspaces}
      profiles={[]}
      currentUserId="u1"
      onOpenTask={onOpenTask}
      onUpdateCell={onUpdateCell}
      {...overrides}
    />
  );
  return { onOpenTask, onUpdateCell };
}

const link = (source: string, target: string): ItemLink =>
  ({ id: `${source}-${target}`, source_item_id: source, target_item_id: target, link_type: "dependency" }) as ItemLink;

beforeEach(() => {
  hookState.value.refresh = vi.fn();
  setData([]);
});

function openWaiting() {
  fireEvent.click(screen.getByRole("button", { name: "Waiting on" }));
}

describe("MissionControlView — waiting on", () => {
  it("shows one card per who, with the workspace, since, follow-up and what it blocks", () => {
    setData(
      [
        item("Devis révisé", { w: { who: "Menuisier", since: day(-5), followUp: day(0) } }),
        item("Validation du devis", {}),
        item("Confirmation virements", { w: { who: "Banque", since: day(-2), followUp: day(1) } }),
      ],
      [link("Devis révisé", "Validation du devis")]
    );
    renderView();
    openWaiting();
    const card = screen.getByRole("article", { name: "Menuisier" });
    expect(within(card).getByText("Agdal T3")).toBeInTheDocument();
    expect(within(card).getByText("Waiting since")).toBeInTheDocument();
    expect(within(card).getByText("5 d")).toBeInTheDocument();
    expect(within(card).getByText("Follow-up")).toBeInTheDocument();
    expect(within(card).getByText("Today")).toBeInTheDocument();
    expect(within(card).getByText("Blocks 1")).toBeInTheDocument();
    expect(within(card).getByText("Validation du devis")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Banque" })).toBeInTheDocument();
    // A due follow-up comes first.
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Menuisier", "Banque"]);
  });

  it("opens the task when its name is clicked", () => {
    setData([item("Devis révisé", { w: { who: "Menuisier", since: day(-5), followUp: null } })]);
    const { onOpenTask } = renderView();
    openWaiting();
    fireEvent.click(screen.getByRole("button", { name: "Devis révisé" }));
    expect(onOpenTask).toHaveBeenCalledWith("b1", "Devis révisé");
  });

  it("marks a wait received by clearing its waiting_on cell", () => {
    setData([item("Devis révisé", { w: { who: "Menuisier", since: day(-5), followUp: null } })]);
    const { onUpdateCell } = renderView();
    openWaiting();
    fireEvent.click(screen.getByRole("button", { name: "Mark received" }));
    expect(onUpdateCell).toHaveBeenCalledWith(expect.objectContaining({ itemId: "Devis révisé", columnId: "w", value: null }));
    expect(hookState.value.refresh).toHaveBeenCalled();
  });

  it("filters to follow-ups due today", () => {
    setData([
      item("A", { w: { who: "Menuisier", since: day(-5), followUp: day(0) } }),
      item("B", { w: { who: "Banque", since: day(-2), followUp: day(3) } }),
    ]);
    renderView();
    openWaiting();
    fireEvent.click(screen.getByRole("button", { name: "Follow up today · 1" }));
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Menuisier"]);
  });

  it("hides done tasks", () => {
    setData([item("Fini", { st: "Done", w: { who: "Banque", since: day(-2), followUp: null } })]);
    renderView();
    openWaiting();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("shows the empty state when no board tracks a wait", () => {
    setData([item("Plain", {})]);
    renderView({ boards: [{ ...boards[0], columns: PLAIN }] });
    openWaiting();
    expect(screen.getByText(/No one to chase/)).toBeInTheDocument();
  });

  it("shows a skeleton, not the empty state, while loading", () => {
    setData([], [], { loading: true });
    renderView();
    openWaiting();
    expect(screen.getByLabelText("Loading mission control")).toBeInTheDocument();
    expect(screen.queryByText(/No one to chase/)).toBeNull();
  });

  it("shows an error with a retry", () => {
    setData([], [], { error: new Error("boom") });
    renderView();
    openWaiting();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(hookState.value.refresh).toHaveBeenCalled();
  });
});

const NOW_COLS = [
  { id: "st", title: "Status", type: "status" },
  { id: "tl", title: "Timeline", type: "timeline" },
  { id: "p", title: "Owner", type: "people" },
  { id: "s", title: "On site", type: "on_site" },
] as Board["columns"];
const nowBoards = [
  { id: "b1", name: "Rénovation", workspace_id: "ws-agdal", columns: NOW_COLS },
  { id: "b2", name: "Sortie", workspace_id: "ws-sale", columns: NOW_COLS },
] as Board[];
const nowWorkspaces = [
  { id: "ws-agdal", name: "Agdal T3" },
  { id: "ws-sale", name: "Salé Tabriquet" },
] as Workspace[];
const dated = (id: string, board: string, offset: number, people: string[], extra: Record<string, unknown> = {}): Item =>
  ({
    id,
    name: id,
    board_id: board,
    group_id: "g",
    position: 0,
    column_values: { tl: { start: day(offset), end: day(offset) }, p: people, ...extra },
  }) as Item;

describe("MissionControlView — Maintenant", () => {
  const renderNow = () =>
    renderView({ boards: nowBoards, workspaces: nowWorkspaces, profiles: [{ id: "u1", full_name: "Youness" }] as never });

  it("opens on Maintenant with at most 3 of my tasks and the reasons", () => {
    // A blocker due tomorrow with six back-to-back tasks behind it.
    const items = [dated("Valider le devis", "b1", 1, ["u1"])];
    const links: ItemLink[] = [];
    let prev = "Valider le devis";
    for (let i = 1; i <= 6; i++) {
      items.push(dated(`Étape ${i}`, "b1", 1 + i, ["u1"]));
      links.push(link(prev, `Étape ${i}`));
      prev = `Étape ${i}`;
    }
    setData(items, links);
    renderNow();
    const rows = screen.getAllByRole("heading", { level: 3 });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Valider le devis");
    expect(screen.getByText("Unblocks 6 tasks")).toBeInTheDocument();
    expect(screen.getAllByText("Critical path").length).toBeGreaterThan(0);
  });

  it("shows only my tasks under Mine, and a colleague's under Team", () => {
    setData([dated("Mine", "b1", -1, ["u1"]), dated("Theirs", "b1", -2, ["u2"])]);
    renderNow();
    expect(screen.queryByText("Theirs")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(screen.getByText("Theirs")).toBeInTheDocument();
  });

  it("opens a task from its row", () => {
    setData([dated("Rappeler le lead", "b1", -1, ["u1"])]);
    const { onOpenTask } = renderNow();
    fireEvent.click(screen.getByRole("button", { name: "Open Rappeler le lead" }));
    expect(onOpenTask).toHaveBeenCalledWith("b1", "Rappeler le lead");
  });

  it("names the person and both tasks in an on-site conflict", () => {
    setData([
      dated("État des lieux", "b2", 4, ["u1"], { s: true }),
      dated("Réception meubles", "b1", 4, ["u1"], { s: true }),
    ]);
    renderNow();
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(/Youness must be on site in two places/);
    expect(within(banner).getByRole("button", { name: /État des lieux/ })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: /Réception meubles/ })).toBeInTheDocument();
  });

  it("says when nothing is urgent", () => {
    setData([dated("Far away", "b1", 30, ["u1"])]);
    renderNow();
    expect(screen.getByText("Nothing urgent today.")).toBeInTheDocument();
  });
});
