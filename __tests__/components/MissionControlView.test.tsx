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
    fireEvent.click(screen.getByRole("button", { name: "Devis révisé" }));
    expect(onOpenTask).toHaveBeenCalledWith("b1", "Devis révisé");
  });

  it("marks a wait received by clearing its waiting_on cell", () => {
    setData([item("Devis révisé", { w: { who: "Menuisier", since: day(-5), followUp: null } })]);
    const { onUpdateCell } = renderView();
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
    fireEvent.click(screen.getByRole("button", { name: "Follow up today · 1" }));
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Menuisier"]);
  });

  it("hides done tasks", () => {
    setData([item("Fini", { st: "Done", w: { who: "Banque", since: day(-2), followUp: null } })]);
    renderView();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("shows the empty state when no board tracks a wait", () => {
    setData([item("Plain", {})]);
    renderView({ boards: [{ ...boards[0], columns: PLAIN }] });
    expect(screen.getByText(/No one to chase/)).toBeInTheDocument();
  });

  it("shows a skeleton, not the empty state, while loading", () => {
    setData([], [], { loading: true });
    renderView();
    expect(screen.getByLabelText("Loading mission control")).toBeInTheDocument();
    expect(screen.queryByText(/No one to chase/)).toBeNull();
  });

  it("shows an error with a retry", () => {
    setData([], [], { error: new Error("boom") });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(hookState.value.refresh).toHaveBeenCalled();
  });
});
