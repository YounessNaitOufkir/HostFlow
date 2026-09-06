import { describe, it, expect, vi } from "vitest";
import { resolveMoveTargetGroup, COMPLETED_GROUP_TITLE } from "@/lib/automations/moveTarget";

/**
 * The bug: a "move to Completed when Done" rule keeps working after its group is
 * deleted. It stays enabled, still pointing at the dead id, and the next status
 * change writes that id as group_id. The foreign key refuses it, and the person
 * who simply set a task to Done is told "a required related record (like a group
 * or board) could not be found".
 */

/**
 * Enough of the query builder to answer the three shapes this uses. Records what
 * was asked so the test can assert the board scope, which is the part that stops
 * an item being filed into another board's group.
 */
function client({
  groupById = null,
  groupByTitle = null,
  insertFails = false,
}: {
  groupById?: { id: string } | null;
  groupByTitle?: { id: string } | null;
  insertFails?: boolean;
} = {}) {
  const calls: Record<string, any[]> = { update: [], insert: [], eq: [] };

  const from = vi.fn((table: string) => {
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: unknown) => { calls.eq.push([table, col, val]); return chain; },
      ilike: () => chain,
      limit: async () => ({ data: groupByTitle ? [groupByTitle] : [] }),
      maybeSingle: async () => ({ data: groupById }),
      single: async () =>
        insertFails
          ? { data: null, error: { message: "denied" } }
          : { data: { id: "new-group" }, error: null },
      insert: (values: unknown) => { calls.insert.push([table, values]); return chain; },
      update: (values: unknown) => { calls.update.push([table, values]); return chain; },
    };
    return chain;
  });

  return { supabase: { from } as any, calls };
}

const opts = { boardId: "b1", targetGroupId: "g-old", automationId: "a1" };

describe("resolveMoveTargetGroup", () => {
  it("uses the stored group when it is still there", async () => {
    const { supabase, calls } = client({ groupById: { id: "g-old" } });

    const result = await resolveMoveTargetGroup(supabase, opts);

    expect(result).toEqual({ status: "ok", groupId: "g-old", healed: false });
    // Nothing created, nothing repointed: the common path stays a single read.
    expect(calls.insert).toHaveLength(0);
    expect(calls.update).toHaveLength(0);
  });

  it("only accepts the stored group if it belongs to THIS board", async () => {
    // A workspace-wide rule can carry another board's group id. Moving an item
    // there hides it rather than merely misfiling it.
    const { supabase, calls } = client({ groupById: { id: "g-old" } });
    await resolveMoveTargetGroup(supabase, opts);
    expect(calls.eq).toContainEqual(["groups", "board_id", "b1"]);
  });

  it("reuses an existing Completed group rather than making a second one", async () => {
    const { supabase, calls } = client({ groupById: null, groupByTitle: { id: "g-completed" } });

    const result = await resolveMoveTargetGroup(supabase, opts);

    expect(result).toEqual({ status: "ok", groupId: "g-completed", healed: true });
    expect(calls.insert).toHaveLength(0);
    // Repointed, so the next edit does not repeat the search.
    expect(calls.update).toContainEqual(["automations", { action_target_id: "g-completed" }]);
  });

  it("re-makes the group when it has been deleted, as turning the rule on would", async () => {
    const { supabase, calls } = client({ groupById: null, groupByTitle: null });

    const result = await resolveMoveTargetGroup(supabase, opts);

    expect(result).toEqual({ status: "ok", groupId: "new-group", healed: true });
    expect(calls.insert[0][1]).toMatchObject({
      board_id: "b1",
      title: COMPLETED_GROUP_TITLE,
    });
    expect(calls.update).toContainEqual(["automations", { action_target_id: "new-group" }]);
  });

  it("reports unavailable rather than returning an id that would fail the key", async () => {
    // The whole point: never hand back something the foreign key will refuse.
    const { supabase } = client({ groupById: null, groupByTitle: null, insertFails: true });

    const result = await resolveMoveTargetGroup(supabase, { ...opts, targetGroupId: null });

    expect(result).toEqual({ status: "unavailable" });
  });

  it("still resolves when the rule never had a target at all", async () => {
    const { supabase } = client({ groupById: null, groupByTitle: { id: "g-completed" } });
    const result = await resolveMoveTargetGroup(supabase, { ...opts, targetGroupId: null });
    expect(result).toEqual({ status: "ok", groupId: "g-completed", healed: true });
  });

  it("does not let a failed repoint cost the move", async () => {
    const { supabase } = client({ groupById: null, groupByTitle: { id: "g-completed" } });
    const original = supabase.from;
    supabase.from = vi.fn((table: string) => {
      const chain = original(table);
      if (table === "automations") {
        chain.update = () => { throw new Error("no permission"); };
      }
      return chain;
    });

    const result = await resolveMoveTargetGroup(supabase, opts);

    expect(result).toEqual({ status: "ok", groupId: "g-completed", healed: true });
  });
});
