import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeImport } from "@/lib/importUtils";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

/**
 * The import's final step removes the default group when nothing landed in it.
 *
 * On an existing board that default is the board's OWN first group, not one the
 * import created — and a CSV carrying a "Group" column routes every row to a
 * named group, so the "nothing landed here" condition is true on a perfectly
 * ordinary import. The cleanup then deleted a group the user already had, and
 * the items already inside it went with it.
 */
describe("import cleanup of the default group", () => {
  /** Records every delete issued against `groups`, so the test can assert on them. */
  let deletedGroupIds: string[];
  let insertedGroups: any[];

  function wireSupabase(existingGroups: { id: string; title: string }[]) {
    deletedGroupIds = [];
    insertedGroups = [];

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn(function (this: any, _col: string, value: string) {
            // eq() after delete() names the group being removed
            if (this.__deleting) deletedGroupIds.push(value);
            return this;
          }),
          order: vi.fn().mockResolvedValue({ data: existingGroups, error: null }),
          insert: vi.fn((rows: any) => {
            insertedGroups.push(rows);
            return Promise.resolve({ error: null });
          }),
          delete: vi.fn(function (this: any) {
            this.__deleting = true;
            return this;
          }),
          then: (resolve: any) => resolve({ data: existingGroups, error: null }),
        } as any;
      }

      // Everything else the import touches: accept and report nothing.
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      } as any;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never deletes a group the board already had", async () => {
    // The user's own first group, which executeImport picks as defaultGroupId.
    wireSupabase([{ id: "pre-existing-group", title: "Phase 1" }]);

    await executeImport(
      {
        target: "existing_board",
        headers: ["Item Name", "Group"],
        // Every row names a different group, so nothing lands in the default.
        data: [
          { "Item Name": "Survey", Group: "Phase 2" },
          { "Item Name": "Concept", Group: "Phase 2" },
        ],
      } as any,
      "ws-1",
      "board-1",
      []
    );

    expect(deletedGroupIds).not.toContain("pre-existing-group");
    expect(deletedGroupIds).toEqual([]);
  });

  it("still cleans up an empty group that this import created", async () => {
    // No groups on the board, so the import creates its own "Imported Group"
    // fallback — that one it may delete when nothing lands in it.
    wireSupabase([]);

    await executeImport(
      {
        target: "existing_board",
        headers: ["Item Name", "Group"],
        data: [{ "Item Name": "Survey", Group: "Phase 2" }],
      } as any,
      "ws-1",
      "board-1",
      []
    );

    const fallback = insertedGroups.find((g) => g?.title === "Imported Group");
    expect(fallback).toBeTruthy();
    expect(deletedGroupIds).toContain(fallback.id);
  });
});
