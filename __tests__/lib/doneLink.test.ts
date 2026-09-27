import { describe, it, expect } from "vitest";
import {
  STATUS_BEFORE_DONE,
  applyDoneLink,
  doneLabelOf,
  doneLinkAvailability,
  marksDone,
} from "@/lib/doneLink";
import type { Board, Column } from "@/types";

const status: Column = { id: "st", title: "Status", type: "status" };
const doneBox: Column = { id: "ok", title: "Done ?", type: "checkbox" };
const board = (columns: Column[], gantt_config: Board["gantt_config"] = null) =>
  ({ columns, gantt_config }) as Pick<Board, "columns" | "gantt_config">;
const b = board([status, doneBox]);

describe("which checkbox columns mark tasks done", () => {
  it("one named Done, Fait or Terminé, with or without a question mark", () => {
    for (const title of ["Done", "Done ?", "done?", "Fait", "Terminé", "Terminée"]) {
      expect(marksDone({ ...doneBox, title }, b)).toBe(true);
    }
    expect(marksDone({ ...doneBox, title: "Milestone" }, b)).toBe(false);
    expect(marksDone({ ...doneBox, title: "Done by client" }, b)).toBe(false);
  });

  it("the switch wins over the name, either way", () => {
    expect(marksDone({ ...doneBox, settings: { marksDone: false } }, b)).toBe(false);
    expect(marksDone({ ...doneBox, title: "Signed off", settings: { marksDone: true } }, b)).toBe(true);
  });

  it("a Gantt milestone column is never one by name", () => {
    expect(marksDone(doneBox, board([status, doneBox], { milestoneColumnId: "ok" }))).toBe(false);
  });

  it("never a column that is not a checkbox", () => {
    expect(marksDone({ ...status, title: "Done" }, b)).toBe(false);
  });
});

describe("the board's done label", () => {
  it("is the declared one, then the one recognised by name - Fait on a French board", () => {
    expect(doneLabelOf(status)).toBe("Done");
    const french: Column = {
      ...status,
      settings: { statusLabels: [{ label: "En cours", color: "" }, { label: "Fait", color: "" }] },
    };
    expect(doneLabelOf(french)).toBe("Fait");
  });

  it("availability says why the switch cannot work", () => {
    expect(doneLinkAvailability(board([doneBox]))).toBe("noStatus");
    const noDone: Column = { ...status, settings: { statusLabels: [{ label: "Open", color: "" }] } };
    expect(doneLinkAvailability(board([noDone, doneBox]))).toBe("noDoneLabel");
    expect(doneLinkAvailability(b)).toBe("ok");
  });
});

describe("applyDoneLink", () => {
  it("ticking sets the status to done and remembers what it was", () => {
    const r = applyDoneLink(b, { st: "Stuck" }, "ok", true);
    expect(r.values).toMatchObject({ ok: true, st: "Done", [STATUS_BEFORE_DONE]: "Stuck" });
    expect(r.statusChange).toEqual({ columnId: "st", from: "Stuck", to: "Done" });
  });

  it("unticking puts the remembered status back and forgets it", () => {
    const r = applyDoneLink(b, { ok: true, st: "Done", [STATUS_BEFORE_DONE]: "Stuck" }, "ok", false);
    expect(r.values.st).toBe("Stuck");
    expect(r.values.ok).toBe(false);
    expect(r.values).not.toHaveProperty(STATUS_BEFORE_DONE);
    expect(r.statusChange).toEqual({ columnId: "st", from: "Done", to: "Stuck" });
  });

  it("a task with no status goes back to none", () => {
    const ticked = applyDoneLink(b, {}, "ok", true).values;
    expect(applyDoneLink(b, ticked, "ok", false).values.st).toBe("");
  });

  it("unticking with nothing remembered goes to Working on it", () => {
    expect(applyDoneLink(b, { ok: true, st: "Done" }, "ok", false).values.st).toBe("Working on it");
  });

  it("ticking a task that is already done changes nothing else", () => {
    const r = applyDoneLink(b, { st: "Done" }, "ok", true);
    expect(r.values).toEqual({ st: "Done", ok: true });
    expect(r.statusChange).toBeNull();
  });

  it("setting the status to done ticks the box; moving it off done unticks it", () => {
    const done = applyDoneLink(b, { st: "Working on it" }, "st", "Done");
    expect(done.values).toMatchObject({ ok: true, st: "Done", [STATUS_BEFORE_DONE]: "Working on it" });
    // The edit is the status itself: no second status change to report.
    expect(done.statusChange).toBeNull();
    const reopened = applyDoneLink(b, done.values, "st", "Stuck");
    expect(reopened.values.ok).toBe(false);
    expect(reopened.values).not.toHaveProperty(STATUS_BEFORE_DONE);
  });

  it("every done box on the board moves together", () => {
    const second: Column = { id: "fait", title: "Fait", type: "checkbox" };
    const r = applyDoneLink(board([status, doneBox, second]), {}, "ok", true);
    expect(r.values).toMatchObject({ ok: true, fait: true, st: "Done" });
  });

  it("a checkbox that is not a done box is just a checkbox", () => {
    const milestone: Column = { id: "ms", title: "Milestone", type: "checkbox" };
    const r = applyDoneLink(board([status, milestone]), { st: "Working on it" }, "ms", true);
    expect(r.values).toEqual({ st: "Working on it", ms: true });
    expect(r.statusChange).toBeNull();
  });

  it("does nothing extra on a board with no status column", () => {
    const r = applyDoneLink(board([doneBox]), {}, "ok", true);
    expect(r.values).toEqual({ ok: true });
  });

  it("does not change the values it was given", () => {
    const before = { st: "Stuck" };
    applyDoneLink(b, before, "ok", true);
    expect(before).toEqual({ st: "Stuck" });
  });
});
