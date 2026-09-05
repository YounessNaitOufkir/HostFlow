import { describe, it, expect, vi, beforeEach } from "vitest";
import { duplicateBoard, duplicateWorkspace } from "@/lib/templateUtils";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => {
  const fromMock = vi.fn();
  return {
    supabase: {
      from: fromMock,
    },
  };
});

describe("templateUtils utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("duplicateBoard duplicates board with groups, columns, items, and automations", async () => {
    const fakeBoard = {
      id: "board-1",
      name: "Project Roadmap",
      workspace_id: "ws-1",
      columns: [
        { id: "col-1", name: "Status", type: "status" },
        { id: "col-2", name: "Owner", type: "person" },
      ],
    };

    const fakeGroups = [
      { id: "grp-1", name: "Q1 Tasks", board_id: "board-1", position: 0, color: "#112233" },
    ];

    const fakeItems = [
      {
        id: "item-1",
        name: "Design UI",
        board_id: "board-1",
        group_id: "grp-1",
        column_values: { "col-1": "Done", "col-2": "Alice" },
      },
    ];

    const fakeAutomations = [
      { id: "auto-1", board_id: "board-1", trigger_type: "status_change" },
    ];

    // Build chainable query mock helper
    const makeQueryMock = (returnValue: any) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: returnValue, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      then: (resolve: any) => resolve({ data: returnValue, error: null }),
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "boards") {
        return makeQueryMock(fakeBoard) as any;
      }
      if (table === "groups") {
        return makeQueryMock(fakeGroups) as any;
      }
      if (table === "items") {
        return makeQueryMock(fakeItems) as any;
      }
      if (table === "automations") {
        return makeQueryMock(fakeAutomations) as any;
      }
      if (table === "item_links") {
        return makeQueryMock([]) as any;
      }
      return makeQueryMock(null) as any;
    });

    const result = await duplicateBoard("board-1", "ws-2", "Project Roadmap (Template)");

    expect(result).toBeDefined();
    expect(supabase.from).toHaveBeenCalledWith("boards");
    expect(supabase.from).toHaveBeenCalledWith("groups");
    expect(supabase.from).toHaveBeenCalledWith("items");
    expect(supabase.from).toHaveBeenCalledWith("automations");
  });

  it("duplicateWorkspace duplicates workspace and its boards", async () => {
    const fakeWorkspace = {
      id: "ws-1",
      name: "Engineering",
      icon: "code",
      is_private: false,
    };

    const fakeBoards = [{ id: "board-1" }];

    const makeQueryMock = (returnValue: any) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: returnValue, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      then: (resolve: any) => resolve({ data: returnValue, error: null }),
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "workspaces") {
        return makeQueryMock(fakeWorkspace) as any;
      }
      if (table === "boards") {
        return makeQueryMock(fakeBoards) as any;
      }
      if (table === "groups") {
        return makeQueryMock([]) as any;
      }
      if (table === "items") {
        return makeQueryMock([]) as any;
      }
      if (table === "automations") {
        return makeQueryMock([]) as any;
      }
      return makeQueryMock(null) as any;
    });

    const result = await duplicateWorkspace("ws-1", "Engineering (Copy)");

    expect(result).toBeDefined();
    expect(supabase.from).toHaveBeenCalledWith("workspaces");
  });
});
