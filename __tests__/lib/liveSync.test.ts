import { describe, it, expect } from "vitest";
import { assignsTo, effectOf, keyId, type LiveChange } from "@/lib/liveSync";

const change = (table: string, row: Record<string, unknown>, eventType: LiveChange["eventType"] = "UPDATE"): LiveChange => ({
  table,
  eventType,
  new: eventType === "DELETE" ? {} : row,
  old: eventType === "DELETE" ? row : { id: row.id },
});

const ids = (keys: (readonly unknown[])[]) => keys.map(keyId);

describe("effectOf", () => {
  it("a task change refreshes its board and the cross-board views, and names the task", () => {
    const effect = effectOf(change("items", { id: "i1", board_id: "b1", column_values: { p: ["u1"] } }), "u1");
    expect(ids(effect.keys)).toEqual(
      ids([["boardData", "b1"], ["portfolio"], ["workspaceGantt"], ["itemsByIds"]])
    );
    expect(effect.itemId).toBe("i1");
    expect(effect.itemValues).toEqual({ p: ["u1"] });
  });

  it("a task deleted for good carries only its id, so every cached board is refreshed", () => {
    const effect = effectOf(change("items", { id: "i1" }, "DELETE"), "u1");
    expect(ids(effect.keys)).toContain(keyId(["boardData"]));
    expect(effect.itemId).toBe("i1");
  });

  it("gaining or losing access refreshes the sidebar lists and who can be assigned", () => {
    for (const table of ["workspace_members", "board_members"]) {
      const keys = ids(effectOf(change(table, { id: "m1" }, "DELETE"), "u1").keys);
      expect(keys).toEqual(expect.arrayContaining(ids([["workspaces"], ["boards", { workspaceId: undefined }], ["profiles"]])));
    }
  });

  it("a comment refreshes that task's comments and names the task for the row count", () => {
    const effect = effectOf(change("updates", { id: "c1", item_id: "i1" }, "INSERT"), "u1");
    expect(ids(effect.keys)).toContain(keyId(["updates", "i1"]));
    expect(effect.commentsOf).toBe("i1");
  });

  it("a comment deleted for good names no task, so no row recounts", () => {
    expect(effectOf(change("updates", { id: "c1" }, "DELETE"), "u1").commentsOf).toBeUndefined();
  });

  it("flags a change to your own profile, and only yours", () => {
    expect(effectOf(change("profiles", { id: "u1", role: "admin" }), "u1").ownProfile).toEqual({ id: "u1", role: "admin" });
    expect(effectOf(change("profiles", { id: "u2" }), "u1").ownProfile).toBeUndefined();
  });

  it("a colleague's new name or colour refreshes names everywhere", () => {
    const keys = ids(effectOf(change("directory_changes", { user_id: "u2" }), "u1").keys);
    expect(keys).toEqual(expect.arrayContaining(ids([["profiles"], ["adminData"], ["accessRequests"]])));
  });

  it("an unknown table changes nothing", () => {
    expect(effectOf(change("cron_runs", { id: "x" }), "u1").keys).toEqual([]);
  });
});

describe("assignsTo", () => {
  it("finds the person in any people column", () => {
    expect(assignsTo({ status: "Done", people: ["u2", "u1"] }, "u1")).toBe(true);
  });
  it("reads people stored as a JSON string", () => {
    expect(assignsTo({ people: '["u1"]' }, "u1")).toBe(true);
  });
  it("is false for someone else, text that mentions them, or no values", () => {
    expect(assignsTo({ people: ["u2"] }, "u1")).toBe(false);
    expect(assignsTo({ note: "u1" }, "u1")).toBe(false);
    expect(assignsTo({ bad: "[not json" }, "u1")).toBe(false);
    expect(assignsTo(undefined, "u1")).toBe(false);
  });
});
