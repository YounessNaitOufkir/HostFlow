import { describe, it, expect } from "vitest";
import { boardReducer, initialBoardStoreState } from "@/hooks/store/boardReducer";
import type { BoardStoreState } from "@/hooks/store/types";
import type { Board, Group, Item, Workspace } from "@/types";

describe("boardReducer", () => {
  const sampleWorkspace: Workspace = {
    id: "ws-1",
    name: "Engineering",
    is_private: false,
    created_at: "2026-01-01T00:00:00Z",
  };

  const sampleBoard: Board = {
    id: "board-1",
    workspace_id: "ws-1",
    name: "Sprint Board",
    description: "Main board",
    columns: [
      { id: "status", title: "Status", type: "status" },
      { id: "date", title: "Date", type: "date" },
    ],
  };

  const sampleGroup: Group = {
    id: "group-1",
    board_id: "board-1",
    title: "To Do",
    color: "#579bfc",
    position: 0,
  };

  const sampleItem: Item = {
    id: "item-1",
    board_id: "board-1",
    group_id: "group-1",
    name: "Implement Auth",
    position: 0,
    column_values: { status: "Done" },
  };

  it("handles SET_WORKSPACES and SET_ACTIVE_WORKSPACE", () => {
    const nextState = boardReducer(initialBoardStoreState, {
      type: "SET_WORKSPACES",
      payload: { workspaces: [sampleWorkspace], active: sampleWorkspace },
    });
    expect(nextState.workspaces).toHaveLength(1);
    expect(nextState.activeWorkspace?.id).toBe("ws-1");

    const clearState = boardReducer(nextState, {
      type: "SET_ACTIVE_WORKSPACE",
      payload: null,
    });
    expect(clearState.activeWorkspace).toBeNull();
  });

  it("handles ADD_BOARD and REMOVE_BOARD", () => {
    const stateWithBoard = boardReducer(initialBoardStoreState, {
      type: "ADD_BOARD",
      payload: sampleBoard,
    });
    expect(stateWithBoard.boards).toHaveLength(1);
    expect(stateWithBoard.boards[0].id).toBe("board-1");

    const stateRemoved = boardReducer(stateWithBoard, {
      type: "REMOVE_BOARD",
      payload: "board-1",
    });
    expect(stateRemoved.boards).toHaveLength(0);
  });

  it("handles ADD_ITEM, UPDATE_ITEM, and REMOVE_ITEM", () => {
    let state = boardReducer(initialBoardStoreState, {
      type: "ADD_ITEM",
      payload: sampleItem,
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0].name).toBe("Implement Auth");

    const updatedItem = { ...sampleItem, name: "Implement Auth v2" };
    state = boardReducer(state, {
      type: "UPDATE_ITEM",
      payload: updatedItem,
    });
    expect(state.items[0].name).toBe("Implement Auth v2");

    state = boardReducer(state, {
      type: "REMOVE_ITEM",
      payload: "item-1",
    });
    expect(state.items).toHaveLength(0);
  });

  it("handles REMOVE_GROUP and cascades deletion of items in that group", () => {
    let state = boardReducer(initialBoardStoreState, {
      type: "ADD_GROUP",
      payload: sampleGroup,
    });
    state = boardReducer(state, {
      type: "ADD_ITEM",
      payload: sampleItem,
    });
    expect(state.groups).toHaveLength(1);
    expect(state.items).toHaveLength(1);

    state = boardReducer(state, {
      type: "REMOVE_GROUP",
      payload: "group-1",
    });
    expect(state.groups).toHaveLength(0);
    expect(state.items).toHaveLength(0);
  });

  it("handles TOGGLE_GROUP_COLLAPSE", () => {
    let state = boardReducer(initialBoardStoreState, {
      type: "TOGGLE_GROUP_COLLAPSE",
      payload: "group-1",
    });
    expect(state.collapsedGroups).toContain("group-1");

    state = boardReducer(state, {
      type: "TOGGLE_GROUP_COLLAPSE",
      payload: "group-1",
    });
    expect(state.collapsedGroups).not.toContain("group-1");
  });

  it("handles SET_MAIN_VIEW", () => {
    const state = boardReducer(initialBoardStoreState, {
      type: "SET_MAIN_VIEW",
      payload: "kanban",
    });
    expect(state.mainView).toBe("kanban");
  });

  it("handles ADD_WORKSPACE, UPDATE_WORKSPACE, and REMOVE_WORKSPACE", () => {
    let state = boardReducer(initialBoardStoreState, {
      type: "ADD_WORKSPACE",
      payload: sampleWorkspace,
    });
    expect(state.workspaces).toHaveLength(1);

    const updatedWorkspace = { ...sampleWorkspace, name: "Engineering Updated" };
    state = boardReducer(state, {
      type: "UPDATE_WORKSPACE",
      payload: updatedWorkspace,
    });
    expect(state.workspaces[0].name).toBe("Engineering Updated");

    state = boardReducer(state, {
      type: "REMOVE_WORKSPACE",
      payload: "ws-1",
    });
    expect(state.workspaces).toHaveLength(0);
  });

  it("handles SET_AUTOMATIONS", () => {
    const sampleAutomation = {
      id: "auto-1",
      board_id: "board-1",
      trigger_type: "status_change",
      action_type: "move_group",
      enabled: true,
      created_at: "2026-01-01T00:00:00Z",
    };
    const state = boardReducer(initialBoardStoreState, {
      type: "SET_AUTOMATIONS",
      payload: [sampleAutomation as any],
    });
    expect(state.boardAutomations).toHaveLength(1);
    expect(state.boardAutomations[0].id).toBe("auto-1");
  });

  it("handles trash items (SET_TRASH_ITEMS, ADD_TRASH_ITEM, REMOVE_TRASH_ITEM)", () => {
    let state = boardReducer(initialBoardStoreState, {
      type: "ADD_TRASH_ITEM",
      payload: { id: "trash-1", name: "Deleted Task" } as any,
    });
    expect(state.trashItems).toHaveLength(1);

    state = boardReducer(state, {
      type: "REMOVE_TRASH_ITEM",
      payload: "trash-1",
    });
    expect(state.trashItems).toHaveLength(0);
  });

  it("handles UI toggle actions (SET_HIDDEN_COLUMNS, SET_SHOW_AUTOMATIONS, SET_SHOW_ADMIN)", () => {
    let state = boardReducer(initialBoardStoreState, {
      type: "SET_HIDDEN_COLUMNS",
      payload: { status: ["status"] },
    });
    expect(state.hiddenColumns.status).toEqual(["status"]);

    state = boardReducer(state, {
      type: "SET_SHOW_AUTOMATIONS",
      payload: true,
    });
    expect(state.showAutomations).toBe(true);

    state = boardReducer(state, {
      type: "SET_SHOW_ADMIN",
      payload: true,
    });
    expect(state.showAdminModal).toBe(true);
  });
});

