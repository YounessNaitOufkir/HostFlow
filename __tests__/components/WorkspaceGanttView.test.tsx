import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import WorkspaceGanttView from "@/components/WorkspaceGanttView";
import type { Board, Group, Item, Workspace } from "@/types";

const TIMELINE = { id: "col-timeline", title: "Works", type: "timeline" as const };

// The real account has three different properties each with a board called
// "Lancement". Flat, the panel lists them identically and you cannot tell which
// checkbox belongs to which property.
const workspaces = [
  { id: "ws-a", name: "Studio A", is_private: false },
  { id: "ws-b", name: "App C", is_private: true },
  { id: "ws-c", name: "General tasks", is_private: false },
] as unknown as Workspace[];

const PEOPLE = { id: "col-people", title: "Owner", type: "people" as const };
const STATUS = { id: "col-status", title: "Status", type: "status" as const };

const boards = [
  { id: "b1", name: "Lancement", workspace_id: "ws-a", columns: [TIMELINE, PEOPLE, STATUS] },
  { id: "b2", name: "Lancement", workspace_id: "ws-b", columns: [TIMELINE, PEOPLE, STATUS] },
  { id: "b3", name: "Communication", workspace_id: "ws-b", columns: [TIMELINE, PEOPLE, STATUS] },
  { id: "b4", name: "Lancement", workspace_id: "ws-c", columns: [TIMELINE, PEOPLE, STATUS] },
] as unknown as Board[];

const profiles = [
  { id: "u1", full_name: "Amina" },
  { id: "u2", full_name: "Léo" },
] as unknown as import("@/types").Profile[];

/** Every board gets a group called "Phase 1" - the names collide by design. */
const groups: Group[] = boards.map((b, i) => ({
  id: `g${i + 1}`,
  title: "Phase 1",
  color: "#579bfc",
  position: 0,
  board_id: b.id,
}));

const items: Item[] = boards.map((b, i) => ({
  id: `i${i + 1}`,
  name: `Permis ${i + 1}`,
  group_id: `g${i + 1}`,
  board_id: b.id,
  position: 0,
  column_values: {
    [TIMELINE.id]: { start: "2026-03-01", end: "2026-03-10" },
    [PEOPLE.id]: i % 2 === 0 ? ["u1"] : ["u2"],
    [STATUS.id]: i % 2 === 0 ? "Working on it" : "Done",
  },
}));

const ganttData = {
  loading: false,
  error: null,
  items,
  groups,
  itemLinks: [],
  automationsFor: () => [],
  refresh: () => {},
};

vi.mock("@/hooks/useWorkspaceGanttData", () => ({
  useWorkspaceGanttData: () => ganttData,
}));

beforeEach(() => {
  localStorage.clear();
});

/**
 * The board picker only. Workspace and board names now appear twice on this
 * screen - once as a checkbox here, once as a swimlane label on the chart -
 * which is the point of the change, so any assertion about the picker has to
 * say it means the picker.
 */
const picker = () => within(screen.getByRole("region", { name: "Included Boards" }));

describe("WorkspaceGanttView — which workspace each board comes from", () => {
  it("groups the boards under their workspace", () => {
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);

    expect(picker().getByText("Studio A")).toBeInTheDocument();
    expect(picker().getByText("App C")).toBeInTheDocument();
    expect(picker().getByText("General tasks")).toBeInTheDocument();
    // the three identically-named boards are still all listed
    expect(picker().getAllByRole("button", { name: /^Lancement$/ })).toHaveLength(3);
  });

  it("puts each duplicate name under a different workspace", () => {
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);
    // App C owns two boards; its group must contain both, and exactly one
    // "Lancement" — not all three.
    const appC = picker().getByText("App C").closest("div")?.parentElement as HTMLElement;
    expect(within(appC).getAllByText("Lancement")).toHaveLength(1);
    expect(within(appC).getByText("Communication")).toBeInTheDocument();
  });

  it("marks a private workspace so it is not mistaken for a shared one", () => {
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);
    const panel = screen.getByRole("region", { name: "Included Boards" });
    expect(panel.querySelectorAll("svg.lucide-lock").length).toBe(1);
  });
});

describe("WorkspaceGanttView — reaching another workspace", () => {
  /** Ticked boards, by the checkbox state the panel renders. */
  const tickedBoardNames = () =>
    picker()
      .getAllByRole("button", { pressed: true })
      .map((el) => el.textContent?.trim() ?? "");

  it("defaults to the workspace you are standing in", () => {
    render(
      <WorkspaceGanttView allBoards={boards} workspaces={workspaces} defaultWorkspaceId="ws-b" />
    );
    // App C owns b2 "Lancement" and b3 "Communication", and nothing else.
    const ticked = tickedBoardNames();
    expect(ticked).toContain("Lancement");
    expect(ticked).toContain("Communication");
    expect(ticked).toHaveLength(2);
  });

  it("still lists every other workspace's boards, so one can be added", () => {
    // The whole point. The view used to be handed one workspace's boards, so a
    // dependency across two properties could not be drawn however well the
    // confirmation behind it was built - both ends have to be on the chart.
    render(
      <WorkspaceGanttView allBoards={boards} workspaces={workspaces} defaultWorkspaceId="ws-b" />
    );
    expect(picker().getByText("Studio A")).toBeInTheDocument();
    expect(picker().getByText("General tasks")).toBeInTheDocument();
    expect(picker().getAllByRole("button", { name: /^Lancement$/ })).toHaveLength(3);
  });

  it("adds a board from another workspace when it is ticked", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceGanttView allBoards={boards} workspaces={workspaces} defaultWorkspaceId="ws-b" />
    );

    const studioA = picker().getByText("Studio A").closest("div")?.parentElement as HTMLElement;
    await user.click(within(studioA).getByRole("button", { name: /^Lancement$/ }));

    expect(tickedBoardNames()).toHaveLength(3);
  });

  it("falls back to everything when no workspace is named", () => {
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);
    expect(tickedBoardNames()).toHaveLength(boards.length);
  });

  it("falls back to everything when the named workspace holds no boards", () => {
    render(
      <WorkspaceGanttView allBoards={boards} workspaces={workspaces} defaultWorkspaceId="ws-empty" />
    );
    // Opening on a blank chart would read as a broken view rather than a choice.
    expect(tickedBoardNames()).toHaveLength(boards.length);
  });
});

describe("WorkspaceGanttView — portfolio swimlanes", () => {
  it("labels every lane with its workspace, so identical board names are told apart", () => {
    // The flaw this replaced: groups from every board were flattened into one
    // list ordered by group position, with nothing on the row naming the board.
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);

    // Each lane is headed by the one string that identifies it. "Lancement"
    // alone names three different properties' boards; this does not.
    expect(screen.getByText("Studio A › Lancement")).toBeInTheDocument();
    expect(screen.getByText("App C › Lancement")).toBeInTheDocument();
    expect(screen.getByText("App C › Communication")).toBeInTheDocument();
    expect(screen.getByText("General tasks › Lancement")).toBeInTheDocument();

    // Four boards, four lanes, each with its own "Phase 1" underneath it.
    expect(screen.getAllByText("Phase 1")).toHaveLength(4);
  });

  it("keeps each board's tasks in its own lane", () => {
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);
    for (const item of items) {
      expect(screen.getAllByText(item.name).length).toBeGreaterThan(0);
    }
  });

  it("drops a board from the chart when it is unticked", async () => {
    const user = userEvent.setup();
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);

    expect(screen.getAllByText("Phase 1")).toHaveLength(4);
    await user.click(picker().getByRole("button", { name: "Communication" }));
    expect(screen.getAllByText("Phase 1")).toHaveLength(3);
  });

  it("remembers the board selection across mounts", async () => {
    const user = userEvent.setup();
    const first = render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);
    await user.click(picker().getByRole("button", { name: "Communication" }));
    first.unmount();

    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);
    expect(screen.getAllByText("Phase 1")).toHaveLength(3);
  });

  // The only test here that types rather than clicks, and the only one that has
  // ever flaked. Every keystroke re-renders the whole chart, so "Communication"
  // then "Studio" is nineteen full renders; with userEvent's default pause
  // between keys, a loaded machine running the rest of the suite alongside it
  // crosses the 5s default and fails on a timeout rather than on a wrong result.
  // The pause simulates a human, which nothing here is asserting about, so it
  // goes - and the budget is raised to cover the renders that remain.
  it("filters the board list by board or property name", { timeout: 20_000 }, async () => {
    const user = userEvent.setup({ delay: null });
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);

    const search = screen.getByLabelText("Filter boards");
    await user.type(search, "Communication");
    expect(picker().getByRole("button", { name: "Communication" })).toBeInTheDocument();
    expect(picker().queryByRole("button", { name: /^Lancement$/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "Studio");
    // Matching the property name keeps its boards findable by the property.
    expect(picker().getAllByRole("button", { name: /^Lancement$/ })).toHaveLength(1);
  });

  it("clears and restores the whole selection in one click", async () => {
    const user = userEvent.setup();
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);

    await user.click(picker().getByRole("button", { name: "Clear" }));
    expect(
      screen.getByText("Select at least one board to view the Master Gantt chart.")
    ).toBeInTheDocument();

    await user.click(picker().getByRole("button", { name: "Select all" }));
    expect(screen.getAllByText("Phase 1")).toHaveLength(4);
  });

  it("says it is read-only rather than leaving a dead drag to be discovered", () => {
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} />);
    expect(screen.getByText("Read-only")).toBeInTheDocument();
  });

  it("becomes editable when given a write path", () => {
    const onUpdateCell = vi.fn();
    render(
      <WorkspaceGanttView
        allBoards={boards}
        workspaces={workspaces}
        onUpdateCell={onUpdateCell}
      />
    );
    // Given a write path, the chart is editable and the badge is gone.
    expect(screen.queryByText("Read-only")).not.toBeInTheDocument();
  });
});

describe("WorkspaceGanttView — cross-board dependencies", () => {
  /**
   * Drag from a bar's finish handle onto the left half of another bar.
   *
   * Handles are found within the source bar's own row rather than by index:
   * lanes render sorted by property, which is not the order the fixture
   * declares them in.
   */
  function dragLink(_container: HTMLElement, fromItem: string, toItem: string) {
    const barOf = (name: string) =>
      screen.getByRole("button", { name: new RegExp(`^${name},`) }) as HTMLElement;

    const from = barOf(fromItem);
    const fromRow = from.parentElement as HTMLElement;
    const fromHandles = fromRow.querySelectorAll('[title^="Drag to link"]');
    fireEvent.pointerDown(fromHandles[1], { clientX: 0, clientY: 0 });

    const to = barOf(toItem);
    const toRow = to.parentElement as HTMLElement;
    const x = parseFloat(to.style.left) + parseFloat(to.style.width) * 0.25;
    const y = parseFloat(toRow.style.top) + parseFloat(toRow.style.height) / 2;
    fireEvent.pointerMove(window, { clientX: x, clientY: y });
    fireEvent.pointerUp(window);
  }

  it("shows link handles once links can be made", () => {
    // The board Gantt only ever shows one board, so this view is the only place
    // a dependency spanning two boards can be drawn.
    const { container } = render(
      <WorkspaceGanttView allBoards={boards} workspaces={workspaces} onCreateLink={() => {}} />
    );
    expect(container.querySelectorAll('[title^="Drag to link"]').length).toBe(
      items.length * 2
    );
  });

  it("makes a link between two boards of the same property without asking", () => {
    // b2 and b3 are both App C. Same property, ordinary constraint.
    const created: { sourceId: string; targetId: string }[] = [];
    const { container } = render(
      <WorkspaceGanttView
        allBoards={boards}
        workspaces={workspaces}
        onCreateLink={(l) => created.push(l)}
      />
    );

    dragLink(container, "Permis 2", "Permis 3");
    expect(created).toEqual([{ sourceId: "i2", targetId: "i3", type: "FS" }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks before linking two different properties, naming both", () => {
    const created: unknown[] = [];
    const { container } = render(
      <WorkspaceGanttView
        allBoards={boards}
        workspaces={workspaces}
        onCreateLink={(l) => created.push(l)}
      />
    );

    // i1 is in Studio A, i3 is in App C.
    dragLink(container, "Permis 1", "Permis 3");

    expect(created).toHaveLength(0);
    const dialog = screen.getByRole("dialog", {
      name: "Link work across two properties?",
    });
    expect(within(dialog).getByText("Studio A › Lancement")).toBeInTheDocument();
    expect(within(dialog).getByText("App C › Communication")).toBeInTheDocument();
  });

  it("only makes the cross-property link once it is confirmed", async () => {
    const user = userEvent.setup();
    const created: { sourceId: string; targetId: string }[] = [];
    const { container } = render(
      <WorkspaceGanttView
        allBoards={boards}
        workspaces={workspaces}
        onCreateLink={(l) => created.push(l)}
      />
    );

    dragLink(container, "Permis 1", "Permis 3");
    await user.click(screen.getByRole("button", { name: "Link them anyway" }));

    expect(created).toEqual([{ sourceId: "i1", targetId: "i3", type: "FS" }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("makes nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const created: unknown[] = [];
    const { container } = render(
      <WorkspaceGanttView
        allBoards={boards}
        workspaces={workspaces}
        onCreateLink={(l) => created.push(l)}
      />
    );

    dragLink(container, "Permis 1", "Permis 3");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(created).toHaveLength(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("WorkspaceGanttView — portfolio filters", () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: /Filters/ }));
  };

  it("narrows the chart to one owner across every property", async () => {
    // The only control here used to be which boards to include - all or nothing
    // per board - so "what is Amina on" meant reading the whole wall.
    const user = userEvent.setup();
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} profiles={profiles} />);

    expect(screen.getAllByText("Phase 1")).toHaveLength(4);

    await open(user);
    await user.click(screen.getByRole("button", { name: "Amina" }));

    // i1 and i3 belong to Amina, on two different properties.
    expect(screen.getAllByText("Phase 1")).toHaveLength(2);
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} profiles={profiles} />);

    await open(user);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getAllByText("Phase 1")).toHaveLength(2);
  });

  it("combines owner and status as an AND", async () => {
    const user = userEvent.setup();
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} profiles={profiles} />);

    await open(user);
    await user.click(screen.getByRole("button", { name: "Amina" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    // Amina's tasks are all "Working on it", so nothing survives both.
    expect(screen.queryAllByText("Phase 1")).toHaveLength(0);
  });

  it("says how much it is hiding, and clears in one click", async () => {
    const user = userEvent.setup();
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} profiles={profiles} />);

    await open(user);
    await user.click(screen.getByRole("button", { name: "Amina" }));
    expect(screen.getByText("2 of 4 tasks")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Clear all/ }));
    expect(screen.getAllByText("Phase 1")).toHaveLength(4);
  });

  it("only offers owners and statuses that are actually there", async () => {
    const user = userEvent.setup();
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} profiles={profiles} />);

    await open(user);
    expect(screen.getByRole("button", { name: "Amina" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Léo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stuck" })).not.toBeInTheDocument();
  });
});

describe("WorkspaceGanttView — projects only", () => {
  it("shuts every lane to one row per property, and opens them again", async () => {
    const user = userEvent.setup();
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} profiles={profiles} />);

    expect(screen.getAllByText("Phase 1")).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: /Projects only/ }));
    expect(screen.queryAllByText("Phase 1")).toHaveLength(0);
    // The lanes themselves remain - that is the point of the view.
    expect(screen.getByText("Studio A › Lancement")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Projects only/ }));
    expect(screen.getAllByText("Phase 1")).toHaveLength(4);
  });

  it("still lets a single lane be opened from the collapsed view", async () => {
    const user = userEvent.setup();
    render(<WorkspaceGanttView allBoards={boards} workspaces={workspaces} profiles={profiles} />);

    await user.click(screen.getByRole("button", { name: /Projects only/ }));
    await user.click(screen.getByRole("button", { name: /Studio A › Lancement/ }));

    expect(screen.getAllByText("Phase 1")).toHaveLength(1);
  });
});
