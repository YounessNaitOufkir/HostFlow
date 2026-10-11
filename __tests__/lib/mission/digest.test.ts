import { describe, it, expect } from "vitest";
import type { Board, Item, ItemLink } from "@/types";
import { addDaysOnly, dayIndex, parseDateOnly, toDateOnly } from "@/lib/gantt/dates";
import { nowByUser } from "@/lib/mission/digest";

const TODAY_DATE = parseDateOnly("2026-10-08")!;
const TODAY = dayIndex(TODAY_DATE);
const day = (offset: number) => toDateOnly(addDaysOnly(TODAY_DATE, offset));

const board: Board = {
  id: "b1",
  name: "Agdal",
  description: "",
  workspace_id: "ws1",
  columns: [
    { id: "tl", title: "Timeline", type: "timeline" },
    { id: "p", title: "Owner", type: "people" },
    { id: "st", title: "Status", type: "status" },
  ],
};

const task = (id: string, end: number, people: string[], status?: string): Item => ({
  id,
  name: id,
  board_id: "b1",
  group_id: "g",
  position: 0,
  column_values: { tl: { start: day(end), end: day(end) }, p: people, ...(status ? { st: status } : {}) },
});

const link = (source: string, target: string): ItemLink => ({
  id: `${source}-${target}`,
  source_item_id: source,
  target_item_id: target,
  link_type: "dependency",
  created_at: "2026-10-01T00:00:00Z",
});

describe("nowByUser", () => {
  it("gives each reader only their own tasks, best first", () => {
    const items = [task("Mine late", -2, ["u1"]), task("Mine soon", 1, ["u1"]), task("Theirs", -3, ["u2"])];
    const result = nowByUser(items, [board], [], TODAY, ["u1", "u2"]);
    expect(result.get("u1")!.map((t) => t.item.name)).toEqual(["Mine late", "Mine soon"]);
    expect(result.get("u2")!.map((t) => t.item.name)).toEqual(["Theirs"]);
  });

  it("caps each reader at three", () => {
    const items = [-4, -3, -2, -1].map((d) => task(`T${d}`, d, ["u1"]));
    expect(nowByUser(items, [board], [], TODAY, ["u1"]).get("u1")).toHaveLength(3);
  });

  it("lists a shared task for every assignee", () => {
    const result = nowByUser([task("Shared", 0, ["u1", "u2"])], [board], [], TODAY, ["u1", "u2"]);
    expect(result.get("u1")!.map((t) => t.item.name)).toEqual(["Shared"]);
    expect(result.get("u2")!.map((t) => t.item.name)).toEqual(["Shared"]);
  });

  it("ranks with the dependencies, like the view", () => {
    // Same due date; the one with work waiting behind it wins.
    const items = [task("Alone", 1, ["u1"]), task("Blocker", 1, ["u1"]), task("Next", 5, ["u2"])];
    const result = nowByUser(items, [board], [link("Blocker", "Next")], TODAY, ["u1"]);
    expect(result.get("u1")![0].item.name).toBe("Blocker");
  });

  it("leaves out done tasks and readers who did not ask for a digest", () => {
    const items = [task("Done", -1, ["u1"], "Done"), task("Other", -1, ["u9"])];
    const result = nowByUser(items, [board], [], TODAY, ["u1"]);
    expect(result.get("u1")).toEqual([]);
    expect(result.has("u9")).toBe(false);
  });
});
